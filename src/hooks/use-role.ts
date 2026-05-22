import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "admin" | "editor" | "viewer";

export function useRole() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-role", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as AppRole) ?? null;
    },
  });
  const role = data ?? null;
  return {
    role,
    isLoading,
    isAdmin: role === "admin",
    canEdit: role === "admin" || role === "editor",
  };
}
