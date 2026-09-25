import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  allowance,
  budgetAllows,
  isJudgeCode,
  PASS_COOKIE,
  passCookie,
  QUOTA,
  quotaOn,
  readPass,
} from "@/lib/server/quota";

export const runtime = "nodejs";

/** How much live dreaming this visitor has left today (lib/server/quota.ts). */
export type QuotaState = {
  /** False when there is no limit (local development). */
  limited: boolean;
  dreams: number;
  dreamsLeft: number;
  minutesLeft: number;
  judge: boolean;
  /** False when today's shared budget is spent (judges are not stopped by it). */
  open: boolean;
};

async function state(): Promise<QuotaState> {
  const pass = readPass((await cookies()).get(PASS_COOKIE)?.value);
  const dreams = allowance(pass);
  const dreamsLeft = Math.max(0, dreams - pass.used);
  const limited = quotaOn();
  return {
    limited,
    dreams,
    dreamsLeft,
    minutesLeft: dreamsLeft * 5,
    judge: pass.judge,
    open: !limited || pass.judge || (await budgetAllows()),
  };
}

export async function GET() {
  return NextResponse.json(await state(), { headers: { "Cache-Control": "no-store" } });
}

/** A judge code turns this browser's pass into a judge's pass. */
export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isJudgeCode(body.code)) return NextResponse.json({ error: "That code did not work" }, { status: 403 });
  const jar = await cookies();
  const pass = readPass(jar.get(PASS_COOKIE)?.value);
  jar.set(passCookie({ ...pass, judge: true }));
  // The pass is written; read the new state as it will be seen from now on.
  const dreams = QUOTA.judgeDreams;
  const dreamsLeft = Math.max(0, dreams - pass.used);
  return NextResponse.json({ limited: quotaOn(), dreams, dreamsLeft, minutesLeft: dreamsLeft * 5, judge: true, open: true } satisfies QuotaState);
}
