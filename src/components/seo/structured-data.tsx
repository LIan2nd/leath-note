import { siteConfig } from "~/lib/site-config";

const creatorId = `${siteConfig.creator.url}/#person`;
const websiteId = `${siteConfig.url}/#website`;
const applicationId = `${siteConfig.url}/#application`;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": creatorId,
      name: siteConfig.creator.name,
      alternateName: siteConfig.creator.alternateName,
      url: siteConfig.creator.url,
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: siteConfig.name,
      alternateName: siteConfig.alternateName,
      url: siteConfig.url,
      description: siteConfig.description,
      inLanguage: siteConfig.language,
      creator: { "@id": creatorId },
    },
    {
      "@type": "WebApplication",
      "@id": applicationId,
      name: siteConfig.name,
      alternateName: siteConfig.alternateName,
      url: siteConfig.url,
      image: `${siteConfig.url}${siteConfig.logoPath}`,
      description: siteConfig.description,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern web browser",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Distraction-free online scratchpad",
        "Personal notes with autosave",
        "Folder organization",
        "Optional AI writing assistant",
      ],
      creator: { "@id": creatorId },
      isPartOf: { "@id": websiteId },
    },
  ],
};

export function StructuredData() {
  const json = JSON.stringify(structuredData).replace(/</g, "\\u003c");

  return (
    <script
      id="leath-notes-structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
