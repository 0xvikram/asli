/**
 * The numbers on the home page. Each one names exactly what it measures and where it comes from,
 * so a reader can open the source. India publishes cyber-fraud totals, not a count of fake
 * notices, so the rupee figure is labelled as all cyber fraud.
 */
export type Stat = {
  value: string
  label: string
  source: string
  url: string
  /** When the figure was published, ISO date. */
  published: string
}

export const STATS: Stat[] = [
  {
    value: "₹22,845 cr",
    label: "lost by Indians to cyber fraud in 2024, three times 2023",
    source: "MHA, Lok Sabha reply",
    url: "https://www.theweek.in/wire-updates/business/2025/07/22/del23-lsq-cyber-fraud.html",
    published: "2025-07-22",
  },
  {
    value: "93%",
    label: "of Indian job seekers have run into fake or suspicious job offers",
    source: "Indeed survey",
    url: "https://www.businesstoday.in/jobs/story/more-than-9-in-10-job-seekers-encounter-fake-job-offers-542006-2026-07-09",
    published: "2026-07-09",
  },
  {
    value: "75%",
    label: "skip real job openings at times, afraid they are scams",
    source: "Indeed survey",
    url: "https://www.businesstoday.in/jobs/story/more-than-9-in-10-job-seekers-encounter-fake-job-offers-542006-2026-07-09",
    published: "2026-07-09",
  },
  {
    value: "May 2026",
    label: "a fake circular 'cancelled' CBSE re-evaluation, and CBSE had to deny it",
    source: "Gulf News",
    url: "https://gulfnews.com/amp/story/uae%2Feducation%2Fcbse-refutes-claim-of-re-evaluation-cancellation-assures-continuity-1.500551161",
    published: "2026-05-23",
  },
]
