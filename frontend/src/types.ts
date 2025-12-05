export type FlavorTag =
  | 'fruity'
  | 'floral'
  | 'citrus'
  | 'chocolate'
  | 'caramel'
  | 'nutty'
  | 'spice'
  | 'herbal';

export interface Bean {
  id: string;
  name: string;
  roaster?: string;
  origin?: string;
  process?: string;
  roast_level?: string;
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
  rating?: number;
  ratio?: number;
  created_at: string;
  updated_at: string;
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
  rating?: number;
  quick_notes?: string;
}

export interface LocalBrew extends BrewDraft {
  local_id: string;
  synced: boolean;
  created_at: string;
}

export interface MetricsOverview {
  top_beans: Array<{ bean_id: string; bean_name: string; brew_count: number; avg_rating: number }>;
  recent_brews: Array<{ brew_id: string; bean_name: string; date: string; rating?: number }>;
  rating_trends: Array<{ week: string; avg_rating: number; count: number }>;
}
