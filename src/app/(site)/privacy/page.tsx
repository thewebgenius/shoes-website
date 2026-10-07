import type { Metadata } from "next";
import { site } from "@/config/site";
import { LegalPage } from "@/components/site/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={site.legal.updated}>
      <p>
        This policy explains what {site.name} (“we”) collects when you use this website and how we protect it. We collect as little as possible. This text is a
        starting template and should be reviewed by a qualified adviser for your jurisdiction before launch.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Usage events</strong>: which products are viewed, 3D-viewer interactions, try-on and search requests, and review submissions. We store these with a
          keyed hash of your IP address, never the address itself, and never link them to your identity.
        </li>
        <li>
          <strong>Reviews</strong>: the rating, display name and text you submit. Please don’t include personal details. Reviews are checked by staff before they
          are published.
        </li>
        <li>
          <strong>Staff accounts</strong>: for store staff only, an email address and a securely hashed password, plus a log of admin actions.
        </li>
      </ul>
      <p>We don’t use advertising trackers, third-party analytics, or sell any data.</p>

      <h2 id="try-on">Try-On Lab photos</h2>
      <ul>
        <li>Your photo is used only to generate your preview. It is processed in memory and is never written to our storage or database.</li>
        <li>It is not shared through any public link and is never used to train AI models.</li>
        <li>
          The generated preview is stored privately for a short time so you can view it, readable only by the browser that created it, and is deleted
          automatically after it expires or immediately when you choose “Delete now”.
        </li>
        <li>If an external AI provider is connected, your photo is sent to it over an encrypted connection with instructions not to retain it or use it for training.</li>
        <li>We do not measure feet, estimate size or perform any biometric or medical analysis.</li>
      </ul>

      <h2>Find My Shoe photos</h2>
      <p>Photos uploaded for visual search are analysed in memory to compute a numeric description of the shoe and are then discarded. We keep only which catalogue items were returned.</p>

      <h2>Cookies</h2>
      <p>
        We set no cookies for ordinary visitors, apart from a short-lived, HttpOnly cookie that lets your browser view your own try-on preview. Staff who sign in
        receive a secure session cookie.
      </p>

      <h2>Your choices</h2>
      <p>
        To ask about or remove a review you posted, contact us at {site.legal.contactEmail}. Because we don’t store identities for visitors, please tell us the
        product and the display name you used.
      </p>
    </LegalPage>
  );
}
