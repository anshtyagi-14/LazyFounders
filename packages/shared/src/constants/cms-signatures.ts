export interface CmsSignature {
  name: string;
  detectionStrategies: {
    headerPatterns: RegExp[];
    metaPatterns: RegExp[];
    pathProbes: string[];
    htmlPatterns: RegExp[];
    sitemapPaths: string[];
  };
}

export const CMS_SIGNATURES: CmsSignature[] = [
  {
    name: 'WordPress',
    detectionStrategies: {
      headerPatterns: [/wp-super-cache/i, /w3-total-cache/i, /x-pingback/i],
      metaPatterns: [/generator.*wordpress/i],
      pathProbes: ['/wp-login.php', '/wp-admin/'],
      htmlPatterns: [/wp-content/i, /wp-includes/i],
      sitemapPaths: ['/wp-sitemap.xml', '/sitemap_index.xml']
    }
  },
  {
    name: 'Ghost',
    detectionStrategies: {
      headerPatterns: [/x-ghost-cache/i],
      metaPatterns: [/generator.*ghost/i],
      pathProbes: ['/ghost/'],
      htmlPatterns: [/ghost-blog/i],
      sitemapPaths: ['/sitemap.xml', '/sitemap-index.xml']
    }
  },
  {
    name: 'Drupal',
    detectionStrategies: {
      headerPatterns: [/x-generator.*drupal/i, /x-drupal-cache/i],
      metaPatterns: [/generator.*drupal/i],
      pathProbes: ['/user/login', '/core/misc/drupal.js'],
      htmlPatterns: [/sites\/default\/files/i, /drupal-settings-json/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Joomla',
    detectionStrategies: {
      headerPatterns: [/x-content-encoded-by.*joomla/i],
      metaPatterns: [/generator.*joomla/i],
      pathProbes: ['/administrator/'],
      htmlPatterns: [/components\/com_/i, /modules\/mod_/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Shopify',
    detectionStrategies: {
      headerPatterns: [/x-shopid/i, /x-shopify-stage/i],
      metaPatterns: [/shopify/i],
      pathProbes: ['/cart', '/admin'],
      htmlPatterns: [/cdn\.shopify\.com/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Webflow',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/generator.*webflow/i],
      pathProbes: [],
      htmlPatterns: [/data-wf-site/i, /data-wf-page/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Wix',
    detectionStrategies: {
      headerPatterns: [/x-wix-request-id/i],
      metaPatterns: [/generator.*wix/i],
      pathProbes: [],
      htmlPatterns: [/_wix_/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Next.js',
    detectionStrategies: {
      headerPatterns: [/x-powered-by.*next\.js/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [/_next/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Nuxt',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [/_nuxt/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Django',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [],
      pathProbes: ['/admin/'],
      htmlPatterns: [/csrfmiddlewaretoken/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Flask',
    detectionStrategies: {
      headerPatterns: [/server.*werkzeug/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'FastAPI',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [],
      pathProbes: ['/docs', '/redoc'],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Laravel',
    detectionStrategies: {
      headerPatterns: [/x-powered-by.*laravel/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Rails',
    detectionStrategies: {
      headerPatterns: [/x-powered-by.*phusion passenger/i, /x-rack-cache/i],
      metaPatterns: [/csrf-param/i, /csrf-token/i],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Hugo',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/generator.*hugo/i],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Jekyll',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/generator.*jekyll/i],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Gatsby',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/generator.*gatsby/i],
      pathProbes: [],
      htmlPatterns: [/gatsby-focus-wrapper/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Eleventy',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/generator.*eleventy/i],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Astro',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/generator.*astro/i],
      pathProbes: [],
      htmlPatterns: [/astro-island/i],
      sitemapPaths: ['/sitemap-index.xml']
    }
  },
  {
    name: 'Cloudflare Pages',
    detectionStrategies: {
      headerPatterns: [/cf-ray/i, /server.*cloudflare/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Vercel',
    detectionStrategies: {
      headerPatterns: [/x-vercel-id/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Netlify',
    detectionStrategies: {
      headerPatterns: [/server.*netlify/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Squarespace',
    detectionStrategies: {
      headerPatterns: [/server.*squarespace/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [/squarespace/i],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Blogger',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/generator.*blogger/i],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Tumblr',
    detectionStrategies: {
      headerPatterns: [/x-tumblr-user/i],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap.xml']
    }
  },
  {
    name: 'Medium',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [/al:ios:app_name.*medium/i],
      pathProbes: [],
      htmlPatterns: [],
      sitemapPaths: ['/sitemap/sitemap.xml']
    }
  },
  {
    name: 'Substack',
    detectionStrategies: {
      headerPatterns: [],
      metaPatterns: [],
      pathProbes: [],
      htmlPatterns: [/substack-custom-font/i],
      sitemapPaths: ['/sitemap.xml']
    }
  }
];
