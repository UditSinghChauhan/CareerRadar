import { Link } from "wouter";
import { LogoMark } from "@/components/logo-mark";
import {
  AUTHOR_NAME,
  AUTHOR_URL,
  LINKEDIN_URL,
  PORTFOLIO_URL,
  REPO_URL,
} from "./links";

export function LandingFooter({ signInHref }: { signInHref: string }) {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer__in">
        <div className="lp-footer__brand">
          <p className="lp-word">
            <LogoMark />
            CareerRadar
          </p>
          <p className="lp-quiet">
            Designed and built by{" "}
            <a href={AUTHOR_URL} className="lp-footer__credit">
              {AUTHOR_NAME}
            </a>
          </p>
        </div>
        <nav aria-label="Project" className="lp-footer__links">
          <Link href="/design-notes" className="lp-footer__link">
            Design notes
          </Link>
          <a href={REPO_URL} className="lp-footer__link">
            Source on GitHub
          </a>
          {PORTFOLIO_URL && (
            <a href={PORTFOLIO_URL} className="lp-footer__link">
              Portfolio
            </a>
          )}
          {LINKEDIN_URL && (
            <a href={LINKEDIN_URL} className="lp-footer__link">
              LinkedIn
            </a>
          )}
          <Link href={signInHref} className="lp-footer__link">
            Sign in
          </Link>
          <span className="lp-quiet">MIT licence</span>
        </nav>
      </div>
    </footer>
  );
}
