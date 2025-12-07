import type { Bean, Brew, MetricsOverview } from '../types';

const timestamp = () => new Date().toISOString();

export const SAMPLE_BEANS: Bean[] = [
  {
    id: 'sample-ethiopia',
    name: 'Ethiopia Yirgacheffe',
    roaster: 'Blue Bottle',
    origin: 'Ethiopia',
    process: 'Natural',
    roast_level: 'Light',
    notes: 'Blueberry, jasmine, honey sweetness',
    created_at: timestamp(),
    updated_at: timestamp()
  },
  {
    id: 'sample-colombia',
    name: 'Colombia Huila',
    roaster: 'Onyx',
    origin: 'Colombia',
    process: 'Washed',
    roast_level: 'Medium',
    notes: 'Caramel, stone fruit, balanced body',
    created_at: timestamp(),
    updated_at: timestamp()
  },
  {
    id: 'sample-guatemala',
    name: 'Guatemala Huehuetenango',
    roaster: 'Heart',
    origin: 'Guatemala',
    process: 'Honey',
    roast_level: 'Medium-light',
    notes: 'Cocoa, citrus zest, floral aroma',
    created_at: timestamp(),
    updated_at: timestamp()
  }
];

export const SAMPLE_BREWS: Brew[] = [
  {
    id: 'sample-brew-1',
    bean_id: 'sample-ethiopia',
    bean_name: 'Ethiopia Yirgacheffe',
    date: timestamp().slice(0, 10),
    grinder_name: 'EK43',
    bean_weight_g: 18,
    water_weight_g: 288,
    grind_setting: '7.5',
    water_temp_c: 96,
    bloom_time_s: 40,
    total_brew_time_s: 180,
    agitation_events: [
      { timestamp_s: 0, action: 'pour', amount_g: 60 },
      { timestamp_s: 45, action: 'pour', amount_g: 120 }
    ],
    tasting_notes: 'Blueberry compote, silky texture',
    flavor_tags: ['Fruity', 'Floral'],
    aroma_tags: ['Floral', 'Fruity'],
    rating: 9,
    aroma_rating: 9,
    flavor_rating: 9,
    ratio: 16,
    created_at: timestamp(),
    updated_at: timestamp()
  },
  {
    id: 'sample-brew-2',
    bean_id: 'sample-colombia',
    bean_name: 'Colombia Huila',
    date: timestamp().slice(0, 10),
    grinder_name: 'Comandante C40',
    bean_weight_g: 20,
    water_weight_g: 320,
    grind_setting: '24 clicks',
    water_temp_c: 94,
    bloom_time_s: 45,
    total_brew_time_s: 210,
    agitation_events: [],
    tasting_notes: 'Caramelized sugar, plum and cocoa',
    flavor_tags: ['Caramel', 'Chocolatey'],
    aroma_tags: ['Chocolate', 'Spicy'],
    rating: 8,
    aroma_rating: 8,
    flavor_rating: 8,
    ratio: 16,
    created_at: timestamp(),
    updated_at: timestamp()
  }
];

export const SAMPLE_METRICS: MetricsOverview = {
  top_beans: [
    { bean_id: 'sample-ethiopia', bean_name: 'Ethiopia Yirgacheffe', brew_count: 12, avg_rating: 9.2 },
    { bean_id: 'sample-colombia', bean_name: 'Colombia Huila', brew_count: 8, avg_rating: 8.6 }
  ],
  recent_brews: SAMPLE_BREWS.map((brew) => ({
    brew_id: brew.id,
    bean_name: brew.bean_name ?? '',
    date: brew.date,
    rating: brew.rating
  })),
  rating_trends: [
    { date: '2024-11-20', iso_week: '2024-47', avg_rating: 8.5, count: 3 },
    { date: '2024-11-27', iso_week: '2024-48', avg_rating: 9, count: 2 }
  ]
};
