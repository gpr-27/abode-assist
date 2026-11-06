import { getSession, isStaff } from "@/lib/auth/session";

// Synthetic rows only. Row 2 repeats a seeded lead's phone (merges instead of duplicating);
// row 5 has an invalid phone and no e-mail (rejected); row 6 has no consent (no auto-message).
const SAMPLE = `name,phone,email,project,wants,source,consent,note
Jignesh Bhatt,98240 11223,,Project 1,3 BHK,99acres,yes,Wants east facing
Nidhi Shah,+91 98765 58211,,Project 2,2 BHK,MagicBricks,yes,Second enquiry from another portal
Krupa Raval,9909012345,krupa.raval@example.com,Project 2,2 BHK,Housing.com,yes,
Manan Sheth,098250 55667,,Project 1,2 BHK,99acres,yes,Number typed with a leading zero
Tushar Amin,12345,,Project 1,3 BHK,99acres,yes,Broken number from portal
Disha Vyas,9727012345,,Project 2,3 BHK,MagicBricks,no,Did not tick WhatsApp opt-in
`;

export async function GET() {
  if (!isStaff(await getSession())) return new Response("Sign in as staff to download this file.", { status: 401 });
  return new Response(SAMPLE, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="portal-leads-sample.csv"' },
  });
}
