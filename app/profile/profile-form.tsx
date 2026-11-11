import { SubmitButton } from "../submit-button";
import { saveProfile } from "./actions";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type Props = { mode: "setup" | "settings"; profile?: Profile | null; error?: string };

export function ProfileForm({ mode, profile, error }: Props) {
  return (
    <form action={saveProfile} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <label className="block text-sm">
        Display name
        <input name="display_name" required maxLength={80} defaultValue={profile?.display_name} className="field" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          Age
          <input name="age" type="number" required min={10} max={120} defaultValue={profile?.age} className="field" />
        </label>
        <label className="block text-sm">
          Gender
          <select name="gender" required defaultValue={profile?.gender ?? ""} className="field">
            <option value="" disabled>Select</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm">
          Weight (kg)
          <input name="weight_kg" type="number" step="0.1" required min={20} max={400} defaultValue={profile?.weight_kg} className="field" />
        </label>
        <label className="block text-sm">
          Height (cm)
          <input name="height_cm" type="number" step="0.1" required min={100} max={250} defaultValue={profile?.height_cm} className="field" />
        </label>
      </div>
      <SubmitButton pendingText="Saving" className="btn">
        {mode === "setup" ? "Save and continue" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
