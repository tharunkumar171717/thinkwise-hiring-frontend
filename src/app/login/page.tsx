import { redirect } from "next/navigation";

/* The standalone login page was replaced by a modal on the landing page.
   Keep /login as a route so old links and auth redirects still work. */
export default function LoginRedirect() {
    redirect("/?login=1");
}
