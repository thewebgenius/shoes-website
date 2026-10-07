import type { Metadata } from "next";
import { site } from "@/config/site";
import { LegalPage } from "@/components/site/legal";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated={site.legal.updated}>
      <p>
        By using the {site.name} website you agree to these terms. This text is a starting template and should be reviewed by a qualified adviser before launch.
      </p>
      <h2>A showroom, not a shop</h2>
      <p>The website lets you browse our range. It does not offer online ordering, payment or delivery. Availability, sizes and prices are confirmed in store.</p>
      <h2>3D models and images</h2>
      <p>
        We work hard to make models and photos accurate, but colours and details can vary by screen. Some products use a labelled studio sample model while our own
        scan is pending; AI-generated models are labelled as such.
      </p>
      <h2>AI features</h2>
      <ul>
        <li>Try-On Lab results are AI-generated visual previews. They are not a guarantee of appearance, size, fit or comfort.</li>
        <li>Find My Shoe shows visually similar shoes. It is not a brand, model or authenticity identification.</li>
        <li>AI-suggested product details are always checked by staff before publication.</li>
      </ul>
      <h2>Reviews</h2>
      <p>
        Reviews must be honest, about the product, and free of abuse, spam, links or personal information. We may decline or remove reviews that break these rules.
        By submitting a review you allow us to display it on this site.
      </p>
      <h2>Acceptable use</h2>
      <p>Don’t upload photos of other people without their permission, or content that is unlawful or offensive. Automated scraping and attempts to bypass security or rate limits are not allowed.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: {site.legal.contactEmail}.</p>
    </LegalPage>
  );
}
