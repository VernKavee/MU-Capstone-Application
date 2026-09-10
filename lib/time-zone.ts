import { cookies } from "next/headers";
import { timeZone, TZ_COOKIE } from "./history";

// The browser's time zone, for server rendering that dates sets (lib/history.ts).
export const userTimeZone = async () => timeZone((await cookies()).get(TZ_COOKIE)?.value);
