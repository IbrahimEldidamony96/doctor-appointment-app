import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { verifyPatientJwt } from "@/lib/auth/patient-jwt";

const isDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);
const isProtectedPatientRoute = createRouteMatcher([
  "/book(.*)", "/my-appointments(.*)", "/payment(.*)", "/profile(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Clerk authenticates dashboard users here; role authorization is done on
  // server layouts, page loaders and EVERY mutation using current DB membership.
  if (isDashboardRoute(req)) {
    await auth.protect();
    return;
  }

  if (isProtectedPatientRoute(req)) {
    const token = req.cookies.get("patient_session")?.value;
    const payload = token ? await verifyPatientJwt(token) : null;
    if (!payload) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
