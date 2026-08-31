import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import robots from "~/app/robots";
import sitemap from "~/app/sitemap";
import { StructuredData } from "~/components/seo/structured-data";
import { siteConfig } from "~/lib/site-config";

describe("SEO discovery", () => {
  it("publishes the canonical homepage in the sitemap", () => {
    expect(sitemap()).toEqual([
      expect.objectContaining({
        url: siteConfig.url,
        priority: 1,
      }),
    ]);
  });

  it("allows the public site while keeping API routes out of crawl paths", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      sitemap: `${siteConfig.url}/sitemap.xml`,
      host: siteConfig.url,
    });
  });

  it("connects Leath Notes with its creator in structured data", () => {
    const markup = renderToStaticMarkup(<StructuredData />);

    expect(markup).toContain('type="application/ld+json"');
    expect(markup).toContain(siteConfig.name);
    expect(markup).toContain(siteConfig.creator.name);
    expect(markup).toContain(siteConfig.creator.alternateName);
    expect(markup).toContain(siteConfig.creator.url);
    expect(markup).toContain('"@type":"WebApplication"');
    expect(markup).toContain('"price":"0"');
  });
});
