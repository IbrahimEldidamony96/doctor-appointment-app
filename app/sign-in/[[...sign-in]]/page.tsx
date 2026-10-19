import { redirect } from "next/navigation";

export default function ClinicSignInPage() {
  redirect("/login?redirect=/dashboard");
}
