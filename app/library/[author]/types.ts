/** One twin variant as the directory route projects it — only what the UI reads
 *  (the server sends more; extra fields flow through untyped). */
export type TwinVariantSummary = {
  variant: 'weights' | 'context';
  enabled: boolean;
  accessible: boolean;
  needsInvite?: boolean;
};

export interface PulseCard {
  alltime: { name: string; pct: number; why: string };
  this_month: Array<{ name: string; why: string }>;
  ideas: number;
  ideas_delta: number;
  themes?: string[];
  fragments?: Array<{ source: string; idea: string }>;
  month: string;
}
