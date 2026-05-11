
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Employees
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  position TEXT,
  department TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, employee_code)
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp own all" ON public.employees FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Salary components (earning/deduction definitions)
CREATE TYPE public.component_type AS ENUM ('earning', 'deduction');

CREATE TABLE public.salary_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.component_type NOT NULL DEFAULT 'earning',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE public.salary_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp own all" ON public.salary_components FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Salary records (per employee per month)
CREATE TABLE public.salary_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, year, month)
);
ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec own all" ON public.salary_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_salary_records_user_period ON public.salary_records(user_id, year, month);

-- Salary record items
CREATE TABLE public.salary_record_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES public.salary_records ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.salary_components ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE(record_id, component_id)
);
ALTER TABLE public.salary_record_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item own select" ON public.salary_record_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.salary_records r WHERE r.id = record_id AND r.user_id = auth.uid()));
CREATE POLICY "item own insert" ON public.salary_record_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.salary_records r WHERE r.id = record_id AND r.user_id = auth.uid()));
CREATE POLICY "item own update" ON public.salary_record_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.salary_records r WHERE r.id = record_id AND r.user_id = auth.uid()));
CREATE POLICY "item own delete" ON public.salary_record_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.salary_records r WHERE r.id = record_id AND r.user_id = auth.uid()));

CREATE INDEX idx_items_record ON public.salary_record_items(record_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_records_updated BEFORE UPDATE ON public.salary_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
