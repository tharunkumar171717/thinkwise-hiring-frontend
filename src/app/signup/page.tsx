import { redirect } from "next/navigation";

/* The standalone signup page was replaced by a modal on the landing page.
   Keep /signup as a route so old links and admin instructions still work. */
export default function SignupRedirect() {
    redirect("/?signup=1");
}
