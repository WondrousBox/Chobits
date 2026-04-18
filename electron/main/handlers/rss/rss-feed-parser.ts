import http from 'node:http';
import https from 'node:https';

import { getHttpProxy as getSystemHttpProxy } from '../proxy/proxy';
import { RssFeedHttpError, RssFeedNetworkError, RssFeedTimeoutError } from './rss-errors';
import { rssSourceRegistry } from './rss-source-registry';
import type { RssFeed, RssFeedItem, RssSourceType } from './types';

/**
 * RSS/Atom Feed 拉取与解析模块
 *
 * 只做：
 * - 请求 feed
 * - 解析 XML/源响应
 * - 归一化为标准 RssFeed / RssFeedItem
 *
 * 不做：
 * - 入库
 * - 下载
 * - UI 文案拼装
 */

/**
 * 拉取并解析远程 RSS/Atom Feed
 */
export async function parseRssFeed(feedUrl: string, sourceType?: RssSourceType): Promise<RssFeed> {
    return new Promise((resolve, reject) => {
        const client = feedUrl.startsWith('https:') ? https : http;
        const agent = getSystemHttpProxy();

        const options: https.RequestOptions | http.RequestOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        if (agent) {
            options.agent = agent as any;
        }

        const req = client.get(feedUrl, options, (res) => {
            if (res.statusCode !== 200) {
                reject(new RssFeedHttpError(res.statusCode!, res.statusMessage));
                return;
            }

            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const feed = parseXmlFeed(data, feedUrl, sourceType);
                    resolve(feed);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (err) => {
            reject(new RssFeedNetworkError(err.message));
        });
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new RssFeedTimeoutError());
        });
    });
}

/**
 * 解析 XML Feed（支持 RSS 2.0 和 Atom）
 */
export function parseXmlFeed(xml: string, feedUrl: string, sourceType?: RssSourceType): RssFeed {
    const items: RssFeedItem[] = [];
    const handler = sourceType ? rssSourceRegistry.getHandler(sourceType) : null;

    // 检测是 Atom 还是 RSS
    const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

    if (isAtom) {
        return parseAtomFeed(xml, feedUrl, handler ?? undefined);
    } else {
        return parseRss2Feed(xml, feedUrl, items);
    }
}

// ── Atom 解析 ───────────────────────────────────────────────

function parseAtomFeed(xml: string, feedUrl: string, handler?: { enhanceFeedItem?(item: RssFeedItem, rawXml?: string): RssFeedItem; enhanceFeed?(feed: RssFeed, rawXml?: string): RssFeed }): RssFeed {
    const items: RssFeedItem[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '';

        const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/);
        const link = linkMatch ? linkMatch[1] : '';

        const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/);
        const published = publishedMatch ? new Date(publishedMatch[1].trim()).getTime() : Date.now();

        const updatedMatch = entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);
        const updated = updatedMatch ? new Date(updatedMatch[1].trim()).getTime() : undefined;

        const descMatch = entry.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/);
        const description = descMatch ? decodeXmlEntities(descMatch[1].trim()) : undefined;

        const authorMatch = entry.match(/<author>\s*<name[^>]*>([\s\S]*?)<\/name>/);
        const author = authorMatch ? decodeXmlEntities(authorMatch[1].trim()) : undefined;

        let item: RssFeedItem = {
            id: link,
            title,
            description,
            link,
            publishedAt: published,
            updatedAt: updated,
            author,
            mediaType: 'article'
        };

        if (handler?.enhanceFeedItem) {
            item = handler.enhanceFeedItem(item, entry);
        } else {
            const thumbnailMatch = entry.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/);
            if (thumbnailMatch) {
                item.thumbnail = thumbnailMatch[1];
            }

            const viewsMatch = entry.match(/<media:statistics[^>]*views=["'](\d+)["']/);
            if (viewsMatch) {
                item.viewCount = parseInt(viewsMatch[1], 10);
            }
        }

        items.push(item);
    }

    const feedTitleMatch = xml.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/);
    const feedTitle = feedTitleMatch ? decodeXmlEntities(feedTitleMatch[1].trim()) : '';

    const feedAuthorMatch = xml.match(/<feed[^>]*>[\s\S]*?<author>\s*<name[^>]*>([\s\S]*?)<\/name>/);
    const feedAuthor = feedAuthorMatch ? decodeXmlEntities(feedAuthorMatch[1].trim()) : undefined;

    let feed: RssFeed = {
        title: feedTitle,
        author: feedAuthor,
        feedUrl,
        items,
        totalItems: items.length
    };

    if (handler?.enhanceFeed) {
        feed = handler.enhanceFeed(feed, xml);
    }

    return feed;
}

// ── RSS 2.0 解析 ────────────────────────────────────────────

function parseRss2Feed(xml: string, feedUrl: string, items: RssFeedItem[]): RssFeed {
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
        const item = match[1];

        const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '';

        const linkMatch = item.match(/<link[^>]*>([\s\S]*?)<\/link>/);
        const link = linkMatch ? linkMatch[1].trim() : '';

        const pubDateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
        const published = pubDateMatch ? new Date(pubDateMatch[1].trim()).getTime() : Date.now();

        const descMatch = item.match(/<description[^>]*>([\s\S]*?)<\/description>/);
        const description = descMatch ? decodeXmlEntities(descMatch[1].trim()) : undefined;

        const authorMatch = item.match(/<author[^>]*>([\s\S]*?)<\/author>/) || item.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/);
        const author = authorMatch ? decodeXmlEntities(authorMatch[1].trim()) : undefined;

        const enclosureMatch = item.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']([^"']+)["'][^>]*length=["'](\d+)["']/);
        let mediaUrl: string | undefined;
        let mediaFormat: string | undefined;
        let sizeBytes: number | undefined;
        let mediaType: RssFeedItem['mediaType'] = 'article';

        if (enclosureMatch) {
            mediaUrl = enclosureMatch[1];
            mediaFormat = enclosureMatch[2];
            sizeBytes = parseInt(enclosureMatch[3], 10);
            if (mediaFormat.startsWith('audio/')) mediaType = 'audio';
            else if (mediaFormat.startsWith('video/')) mediaType = 'video';
            else if (mediaFormat.startsWith('image/')) mediaType = 'image';
        }

        // 提取 itunes:duration（播客时长）
        const durationMatch = item.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/);
        let durationMs: number | undefined;
        if (durationMatch) {
            const durStr = durationMatch[1].trim();
            const parts = durStr.split(':').map(Number);
            if (parts.length === 3) {
                durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
            } else if (parts.length === 2) {
                durationMs = (parts[0] * 60 + parts[1]) * 1000;
            } else if (parts.length === 1) {
                durationMs = parts[0] * 1000;
            }
        }

        const imageMatch = item.match(/<itunes:image[^>]*href=["']([^"']+)["']/) || item.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/);
        const thumbnail = imageMatch ? imageMatch[1] : undefined;

        const guidMatch = item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
        const id = guidMatch ? guidMatch[1].trim() : link;

        items.push({
            id,
            title,
            description,
            link,
            publishedAt: published,
            author,
            thumbnail,
            mediaType,
            mediaUrl,
            mediaFormat,
            sizeBytes,
            durationMs
        });
    }

    const channelTitleMatch = xml.match(/<channel>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/);
    const feedTitle = channelTitleMatch ? decodeXmlEntities(channelTitleMatch[1].trim()) : '';

    const channelDescMatch = xml.match(/<channel>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/);
    const feedDesc = channelDescMatch ? decodeXmlEntities(channelDescMatch[1].trim()) : undefined;

    const channelImageMatch = xml.match(/<channel>[\s\S]*?<image>[\s\S]*?<url[^>]*>([\s\S]*?)<\/url>/);
    const feedImage = channelImageMatch ? channelImageMatch[1].trim() : undefined;

    return {
        title: feedTitle,
        description: feedDesc,
        image: feedImage,
        feedUrl,
        items,
        totalItems: items.length
    };
}

// ── Utilities ────────────────────────────────────────────────

/**
 * 解码 XML 实体
 */
export function decodeXmlEntities(str: string): string {
    return str
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * 检测 RSS 来源类型
 */
export function detectSourceType(url: string): RssSourceType {
    const handler = rssSourceRegistry.detectHandler(url);
    if (handler) {
        return handler.sourceType;
    }

    if (url.includes('bilibili.com')) {
        return 'bilibili';
    }
    if (url.includes('twitter.com') || url.includes('x.com')) {
        return 'twitter';
    }
    if (url.includes('podcast') || url.includes('anchor.fm') || url.includes('spotify.com')) {
        return 'podcast';
    }
    return 'custom';
}
