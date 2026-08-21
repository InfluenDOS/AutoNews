"""RSS feed sources across mainstream Balkan peninsula media.

Only include endpoints verified to return parseable RSS/Atom with entries.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FeedSource:
    name: str
    url: str
    country: str  # ISO 3166-1 alpha-2 style code (XK for Kosovo)


# Verified XML/Atom endpoints (HTML index pages intentionally omitted).
FEED_SOURCES: list[FeedSource] = [
    # ——— Serbia ———
    FeedSource("Blic", "https://www.blic.rs/rss/vesti", "RS"),
    FeedSource("Blic Politika", "https://www.blic.rs/rss/vesti/politika", "RS"),
    FeedSource("Blic Kultura", "https://www.blic.rs/rss/kultura", "RS"),
    FeedSource("Blic Zabava", "https://www.blic.rs/rss/zabava", "RS"),
    FeedSource("B92", "https://www.b92.net/info/rss/vesti.xml", "RS"),
    FeedSource("B92 Kultura", "https://www.b92.net/info/rss/kultura.xml", "RS"),
    FeedSource("RTS", "https://www.rts.rs/page/stories/ci/rss.html", "RS"),
    FeedSource("Novosti", "https://www.novosti.rs/rss/vesti", "RS"),
    FeedSource("Novosti Kultura", "https://www.novosti.rs/rss/kultura", "RS"),
    FeedSource("N1 Serbia", "https://n1info.rs/feed/", "RS"),
    FeedSource("Danas", "https://www.danas.rs/feed/", "RS"),
    # ——— Croatia ———
    FeedSource("Jutarnji", "https://www.jutarnji.hr/feed", "HR"),
    FeedSource("Večernji", "https://www.vecernji.hr/feeds/latest", "HR"),
    FeedSource("24sata", "https://www.24sata.hr/feeds/najnovije.xml", "HR"),
    FeedSource("N1 Croatia", "https://n1info.hr/feed/", "HR"),
    FeedSource("Telegram", "https://www.telegram.hr/feed/", "HR"),
    FeedSource("Net.hr", "https://net.hr/feed", "HR"),
    # ——— Bosnia and Herzegovina ———
    FeedSource("Klix", "https://www.klix.ba/rss", "BA"),
    FeedSource("Avaz", "https://avaz.ba/rss", "BA"),
    FeedSource("N1 BiH", "https://n1info.ba/feed/", "BA"),
    FeedSource("Radio Sarajevo", "https://radiosarajevo.ba/rss", "BA"),
    # ——— Montenegro ———
    FeedSource("CDM", "https://www.cdm.me/feed/", "ME"),
    FeedSource("RTCG", "https://rtcg.me/rss.html", "ME"),
    FeedSource("MINA", "https://mina.news/feed/", "ME"),
    # ——— North Macedonia ———
    FeedSource("Meta.mk", "https://meta.mk/feed/", "MK"),
    FeedSource("Nova Makedonija", "https://novamakedonija.com.mk/feed/", "MK"),
    FeedSource("MRT", "https://mrt.com.mk/rss.xml", "MK"),
    FeedSource("Telma", "https://telma.com.mk/feed/", "MK"),
    # ——— Albania ———
    FeedSource("BalkanWeb", "https://www.balkanweb.com/feed/", "AL"),
    FeedSource("Tirana Times", "https://www.tiranatimes.com/feed/", "AL"),
    # ——— Kosovo ———
    FeedSource("Koha", "https://www.koha.net/rss", "XK"),
    FeedSource("Gazeta Express", "https://www.gazetaexpress.com/feed/", "XK"),
    FeedSource("Kallxo", "https://kallxo.com/feed/", "XK"),
    FeedSource("Prishtina Insight", "https://prishtinainsight.com/feed/", "XK"),
    # ——— Slovenia ———
    FeedSource("24ur", "https://www.24ur.com/rss", "SI"),
    FeedSource("Delo", "https://www.delo.si/rss", "SI"),
    FeedSource("N1 Slovenia", "https://n1info.si/feed/", "SI"),
    # ——— Bulgaria ———
    FeedSource("Actualno", "https://www.actualno.com/rss", "BG"),
    # ——— Regional / entertainment ———
    FeedSource("Balkan Insight", "https://balkaninsight.com/feed/", "REG"),
    FeedSource("Variety", "https://variety.com/feed/", "REG"),
]
