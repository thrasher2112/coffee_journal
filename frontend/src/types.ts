export interface User {
  id: string;
  email: string;
  display_name?: string;
  created_at: string;
}

export type FlavorTag =
  | 'Chocolatey'
  | 'Nutty'
  | 'Caramel'
  | 'Fruity'
  | 'Berry'
  | 'Citrus'
  | 'Floral'
  | 'Spicy';

export type AromaTag =
  | 'Chocolate'
  | 'Nutty'
  | 'Caramel'
  | 'Floral'
  | 'Fruity'
  | 'Spicy'
  | 'Toasty'
  | 'Earthy';

export interface Bean {
  id: string;
  name: string;
  roaster?: string;
  origin?: string;
  process?: string;
  roast_level?: string;
  elevation_m?: number | null;
  notes?: string;
  created_at: string;
  updated_at: string;
  first_used_at?: string | null;
  last_used_at?: string | null;
  avg_rating?: number | null;
  brew_count?: number;
}

export interface Brew {
  id: string;
  date: string;
  bean_id: string;
  bean_name?: string;
  brew_style?: string;
  grinder_name?: string;
  // Snapshots of the setup the brew was logged from (plain text, no link).
  setup_name?: string | null;
  machine_profile?: string | null;
  bean_weight_g: number;
  water_weight_g: number;
  grind_setting?: string;
  grind_setting_notes?: string;
  water_temp_c?: number;
  bloom_time_s?: number;
  total_brew_time_s?: number;
  agitation_events?: AgitationEvent[];
  tasting_notes?: string;
  flavor_tags?: FlavorTag[];
  aroma_tags?: AromaTag[];
  rating?: number;
  aroma_rating?: number;
  flavor_rating?: number;
  ratio?: number;
  created_at: string;
  updated_at: string;
}

/** A saved brew recipe/equipment combo, as the API returns it. */
export interface BrewSetup {
  id: string;
  name: string;
  brew_style: string;
  ratio: number;
  dose_g?: number | null;
  grinder_name?: string | null;
  target_time_s?: number | null;
  machine_profile?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Body for POST /api/setups. Omitted or null optional fields stay unset. */
export interface BrewSetupInput {
  name: string;
  brew_style: string;
  ratio: number;
  dose_g?: number | null;
  grinder_name?: string | null;
  target_time_s?: number | null;
  machine_profile?: string | null;
}

/** Body for PATCH /api/setups/{id}: only the keys present change; null clears. */
export type BrewSetupUpdate = Partial<BrewSetupInput>;

/** GET /api/brews/last-grind: the newest matching brew's grind and date (YYYY-MM-DD). */
export interface LastGrind {
  grind_setting: string;
  date: string;
  // When the brew was logged (ISO timestamp); orders same-day brews.
  created_at?: string;
}

export interface AgitationEvent {
  timestamp_s: number;
  action: string;
  amount_g?: number;
}

export interface BrewDraft {
  id?: string;
  bean_id?: string;
  brew_style?: string;
  grinder_name?: string;
  setup_name?: string;
  machine_profile?: string;
  bean_weight_g: number;
  water_weight_g: number;
  date: string;
  grind_setting?: string;
  grind_setting_notes?: string;
  water_temp_c?: number;
  bloom_time_s?: number;
  total_brew_time_s?: number;
  agitation_events: AgitationEvent[];
  tasting_notes?: string;
  flavor_tags: FlavorTag[];
  aroma_tags?: AromaTag[];
  rating?: number;
  aroma_rating?: number;
  flavor_rating?: number;
}

export interface LocalBrew extends BrewDraft {
  local_id: string;
  synced: boolean;
  created_at: string;
}

export type RatingTrendPoint = {
  date?: string | null;
  iso_week?: string | null;
  week?: string | null;
  avg_rating?: number | null;
  count: number;
};

export interface MetricsOverview {
  top_beans: Array<{ bean_id: string; bean_name: string; brew_count: number; avg_rating: number }>;
  recent_brews: Array<{ brew_id: string; bean_name: string; date: string; rating?: number }>;
  rating_trends: RatingTrendPoint[];
}
