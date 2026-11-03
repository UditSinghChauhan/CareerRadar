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
            <span translate="no">CareerRadar</span>
          </p>
          <p className="lp-small">
            SDE roles for Indian CS freshers, ranked every morning.
          </p>
        </div>
        <nav aria-label="Project" className="lp-footer__links">
          <Link href={signInHref} className="lp-footer__link">
            Sign in
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
          <span className="lp-small">MIT licence</span>
        </nav>
        <p className="lp-small lp-footer__credit">
          Designed and built by{" "}
          <a href={AUTHOR_URL} className="lp-footer__link">
            {AUTHOR_NAME}
          </a>
        </p>
      </div>
    </footer>
  );
}
