import type { NoticeCategory } from "./schema"

/**
 * The synthetic data the seed script publishes, and the one-click examples on the Verify page.
 * One source for both, so every example resolves to the verdict it promises.
 * All institutions are fictional; no real person appears anywhere.
 */
export type SeedNotice = {
  id: string
  issuer: "board" | "univ"
  title: string
  body: string
  category: NoticeCategory
  lang: "en" | "hi" | "mixed"
  /** Days from seeding until the notice stops being valid. */
  validDays: number
  /** What the seed does after publishing. */
  then?: { postponeDays: number; reason: string } | { revoke: string }
}

export const SEED_NOTICES: SeedNotice[] = [
  {
    id: "maths-preboard",
    issuer: "board",
    title: "Class X Mathematics pre-board exam date",
    body: `DEMO BOARD OF SECONDARY EDUCATION
Notice No. DBSE/EXAM/2026/41
The Class X Mathematics pre-board exam will be held on 12 November 2026 from 10:30 am to 1:30 pm.
Admit cards can be downloaded from the board website from 2 November 2026.
Controller of Examinations`,
    category: "exam",
    lang: "en",
    validDays: 27,
  },
  {
    id: "physics-practical",
    issuer: "board",
    title: "Class XII Physics practical schedule",
    body: `DEMO BOARD OF SECONDARY EDUCATION
Notice No. DBSE/EXAM/2026/44
Class XII Physics practical exams will be conducted at the allotted centres from 24 October 2026.
Students must bring their practical file and admit card.`,
    category: "exam",
    lang: "en",
    validDays: 9,
    then: { postponeDays: 24, reason: "Moved after the state election dates were announced. Practicals now run 7 to 8 November 2026" },
  },
  {
    id: "winter-break",
    issuer: "board",
    title: "Winter break for affiliated schools",
    body: `DEMO BOARD OF SECONDARY EDUCATION
Notice No. DBSE/ADMIN/2026/19
All affiliated schools will observe winter break from 20 December 2026 to 5 January 2027.`,
    category: "holiday",
    lang: "en",
    validDays: 60,
    then: { revoke: "Issued in error. A corrected notice with state-wise dates will follow." },
  },
  {
    id: "fee-deadline",
    issuer: "univ",
    title: "Semester exam fee deadline / सेमेस्टर परीक्षा शुल्क",
    body: `PUNE DEMO UNIVERSITY
Circular No. PDU/EXAM/2026/88
The last date to pay the odd semester examination fee is 31 October 2026. Late fee of Rs 500 applies after this date.
विषम सेमेस्टर परीक्षा शुल्क जमा करने की अंतिम तिथि 31 अक्टूबर 2026 है। इसके बाद 500 रुपये विलंब शुल्क लगेगा।
Registrar`,
    category: "fees",
    lang: "mixed",
    validDays: 16,
  },
  {
    id: "campus-closed",
    issuer: "univ",
    title: "Campus closed on 2 November",
    body: `PUNE DEMO UNIVERSITY
Notice No. PDU/ADMIN/2026/112
The main campus will remain closed on 2 November 2026 for maintenance of the power substation. Online classes will run as per the regular timetable.`,
    category: "holiday",
    lang: "en",
    validDays: 18,
  },
  {
    id: "orientation",
    issuer: "univ",
    title: "First-year orientation (short notice)",
    body: `PUNE DEMO UNIVERSITY
Notice No. PDU/SW/2026/07
Orientation for first-year students will be held in the main auditorium tomorrow at 9 am. Attendance is compulsory.`,
    category: "admission",
    lang: "en",
    // Short-lived on purpose: it expires during judging, so the "was real, has expired" path is live.
    validDays: 1.5,
  },
]

/** A doctored copy: the date moved and a fee demand added. Expected verdict: altered. */
export const DOCTORED_FORWARD = `Forwarded many times
*DEMO BOARD OF SECONDARY EDUCATION* 🚨
Notice No. DBSE/EXAM/2026/41
The Class X Mathematics pre-board exam will be held on 19 November 2026 from 10:30 am to 1:30 pm.
Admit cards can be downloaded from the board website from 2 November 2026 after paying Rs 200 late fee.
Controller of Examinations
🙏 Please share with all parents`

/** The impostor's text: published by a wallet the board's domain does not list. */
export const IMPOSTOR_NOTICE = {
  title: "All pre-board exams cancelled",
  body: `DEMO BOARD OF SECONDARY EDUCATION
URGENT: All Class X and XII pre-board exams are cancelled due to a paper leak. Fees will be refunded. Contact your school for details.`,
}

/**
 * One forwarded message in the sample chat on the Verify page. `label` names the case for tests and
 * tooltips; `from`, `group` and `time` dress it as the WhatsApp message it imitates.
 */
export type Example = { label: string; expect: string; text: string; from: string; group: string; time: string }

export function verifyExamples(): Example[] {
  const n = (id: string) => SEED_NOTICES.find((x) => x.id === id)!.body
  const parents = "Class 10-B Parents"
  const hostel = "PDU Hostel Block C"
  return [
    { label: "Doctored forward", expect: "altered", text: DOCTORED_FORWARD, from: "+91 98xxx xxx21", group: parents, time: "9:14 am" },
    { label: "Real (WhatsApp copy)", expect: "real", text: `*${n("maths-preboard")}*\n🙏`, from: "Class teacher", group: parents, time: "9:20 am" },
    { label: "Postponed", expect: "real + postponed", text: n("physics-practical"), from: "Tuition centre", group: "Class XII Science", time: "10:02 am" },
    { label: "Withdrawn", expect: "revoked", text: n("winter-break"), from: "School office", group: parents, time: "11:47 am" },
    { label: "Hindi + English", expect: "real", text: n("fee-deadline"), from: "CR (Sem 3)", group: hostel, time: "12:30 pm" },
    { label: "Impostor", expect: "unverified issuer", text: IMPOSTOR_NOTICE.body, from: "+91 70xxx xxx09", group: parents, time: "1:05 pm" },
    { label: "Expired", expect: "expired (after it lapses)", text: n("orientation"), from: "Senior (2nd year)", group: hostel, time: "Yesterday" },
  ]
}
