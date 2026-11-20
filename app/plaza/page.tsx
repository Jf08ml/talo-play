import { redirect } from "next/navigation";

/** La Plaza is a drawer over any page now (`PlazaProvider`): old links open it on the home. */
export default function PlazaPage() {
  redirect("/?plaza=1");
}
