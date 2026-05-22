
-- 1) Role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_user_roles_updated
BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','editor'));
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

-- 3) Seed: make ALL currently existing users 'admin' (so the current owner keeps full access)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 4) Trigger: new signups -> viewer (unless they're the very first user, then admin)
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_admin;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN has_admin THEN 'viewer'::public.app_role ELSE 'admin'::public.app_role END)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 5) RLS on user_roles
CREATE POLICY "anyone authed can read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage roles insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admins manage roles update" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admins manage roles delete" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) AND user_id <> auth.uid());

-- 6) Replace per-user RLS on data tables with shared access based on role
-- employees
DROP POLICY IF EXISTS "emp own all" ON public.employees;
CREATE POLICY "emp read" ON public.employees FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "emp insert" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "emp update" ON public.employees FOR UPDATE TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "emp delete" ON public.employees FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- departments
DROP POLICY IF EXISTS "dept own all" ON public.departments;
CREATE POLICY "dept read" ON public.departments FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "dept insert" ON public.departments FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "dept update" ON public.departments FOR UPDATE TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "dept delete" ON public.departments FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- salary_components
DROP POLICY IF EXISTS "comp own all" ON public.salary_components;
CREATE POLICY "comp read" ON public.salary_components FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "comp insert" ON public.salary_components FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "comp update" ON public.salary_components FOR UPDATE TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "comp delete" ON public.salary_components FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- salary_records
DROP POLICY IF EXISTS "rec own all" ON public.salary_records;
CREATE POLICY "rec read" ON public.salary_records FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "rec insert" ON public.salary_records FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "rec update" ON public.salary_records FOR UPDATE TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "rec delete" ON public.salary_records FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- salary_record_items
DROP POLICY IF EXISTS "item own select" ON public.salary_record_items;
DROP POLICY IF EXISTS "item own insert" ON public.salary_record_items;
DROP POLICY IF EXISTS "item own update" ON public.salary_record_items;
DROP POLICY IF EXISTS "item own delete" ON public.salary_record_items;
CREATE POLICY "item read" ON public.salary_record_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "item insert" ON public.salary_record_items FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "item update" ON public.salary_record_items FOR UPDATE TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "item delete" ON public.salary_record_items FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- company_settings (admin only writes; everyone reads)
DROP POLICY IF EXISTS "settings own all" ON public.company_settings;
CREATE POLICY "settings read" ON public.company_settings FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "settings insert" ON public.company_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "settings update" ON public.company_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "settings delete" ON public.company_settings FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- profiles: allow everyone authed to read so admin can list users by name
DROP POLICY IF EXISTS "own profile select" ON public.profiles;
CREATE POLICY "all authed read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
