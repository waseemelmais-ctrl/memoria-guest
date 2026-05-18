import React, { createContext, useContext } from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
} from '@react-pdf/renderer';

// ── Page dimension helpers ─────────────────────────────────────
const SIZE_PTS: Record<string, [number, number]> = {
  '5.5x5.5': [396, 396],
  '8x8':     [576, 576],
  '8x11':    [576, 792],
  '11x11':   [792, 792],
};

interface Dims {
  w: number; h: number;
  margin: number; headerH: number; footerH: number; mat: number;
  contentW: number; contentH: number; matW: number; matH: number;
}

function getDims(bookSize?: string, orientation?: string): Dims {
  const [bw, bh] = SIZE_PTS[bookSize ?? '8x11'] ?? SIZE_PTS['8x11'];
  const w = (orientation === 'landscape' && bookSize === '8x11') ? bh : bw;
  const h = (orientation === 'landscape' && bookSize === '8x11') ? bw : bh;
  const margin   = Math.max(18, Math.round(w * 0.046));
  const headerH  = 20;
  const footerH  = 16;
  const mat      = Math.max(8, Math.round(w * 0.02));
  const contentW = w - margin * 2;
  const contentH = h - margin * 2 - headerH - footerH;
  const matW     = contentW - mat * 2;
  const matH     = contentH - mat * 2;
  return { w, h, margin, headerH, footerH, mat, contentW, contentH, matW, matH };
}

const DimsCtx = createContext<Dims>(getDims('8x11', 'portrait'));

// ── Themes ─────────────────────────────────────────────────────
export const BOOK_THEMES: Record<string, {
  key: string; name: string; accent: string; lineColor: string; lineBg: string;
}> = {
  classic:  { key: 'classic',  name: 'Classic',  accent: '#c9a96e', lineColor: '#e0d8cc', lineBg: '#ffffff' },
  mountain: { key: 'mountain', name: 'Mountain', accent: '#4a6fa5', lineColor: '#d0d8e4', lineBg: '#f8faff' },
  forest:   { key: 'forest',   name: 'Forest',   accent: '#2d5a27', lineColor: '#c8d8c6', lineBg: '#f8faf7' },
  sakura:   { key: 'sakura',   name: 'Sakura',   accent: '#c9748a', lineColor: '#e8c8d0', lineBg: '#fffaf8' },
  coastal:  { key: 'coastal',  name: 'Coastal',  accent: '#3a7ca5', lineColor: '#c0d4e8', lineBg: '#f5f8fc' },
  autumn:   { key: 'autumn',   name: 'Autumn',   accent: '#c8763a', lineColor: '#e0c8a8', lineBg: '#fffbf5' },
};

// ── Types ──────────────────────────────────────────────────────
export interface BookPage {
  layout: 1 | 2 | 4;
  photoUrls: string[];
  caption?: string;
  featuredIdx?: number | null;
}

interface MemoryBookProps {
  name: string;
  birthYear: string | number;
  deathYear: string | number;
  heroPhotoUrl: string | null;
  backCoverPhotoUrl?: string | null;
  theme?: string;
  themePhotoUrl?: string | null;
  pages?: BookPage[];
  photoUrls?: string[];
  bookSize?: string;
  orientation?: string;
}

// ── Photo grid ─────────────────────────────────────────────────
const PHOTO_GAP = 6;
const CAPTION_H = 18;

interface PhotoGridProps {
  photoUrls: string[];
  layout: 1 | 2 | 4;
  caption?: string;
  featuredIdx?: number | null;
}

function PhotoGrid({ photoUrls, layout, caption, featuredIdx }: PhotoGridProps) {
  const { mat, matW, matH } = useContext(DimsCtx);
  const hasCaption  = !!caption;
  const photoAreaH  = hasCaption ? matH - CAPTION_H - 6 : matH;
  const matStyle    = { backgroundColor: '#ffffff', padding: mat, flex: 1 };

  if (layout === 1) {
    return (
      <View style={matStyle}>
        <View style={{ width: matW, height: photoAreaH }}>
          {photoUrls[0]
            ? <Image src={photoUrls[0]} style={{ width: matW, height: photoAreaH, objectFit: 'cover' }} />
            : <View style={{ width: matW, height: photoAreaH, backgroundColor: '#111' }} />}
        </View>
        {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic', marginTop: 6 }}>{caption}</Text>}
      </View>
    );
  }

  if (layout === 2) {
    const halfW = (matW - PHOTO_GAP) / 2;
    const w0 = featuredIdx === 1 ? matW * 0.35 - PHOTO_GAP / 2
             : featuredIdx === 0 ? matW * 0.65 - PHOTO_GAP / 2
             : halfW;
    const w1 = matW - PHOTO_GAP - w0;
    return (
      <View style={matStyle}>
        <View style={{ flexDirection: 'row', gap: PHOTO_GAP }}>
          {[w0, w1].map((w, i) => (
            <View key={i} style={{ width: w, height: photoAreaH }}>
              {photoUrls[i]
                ? <Image src={photoUrls[i]} style={{ width: w, height: photoAreaH, objectFit: 'cover' }} />
                : <View style={{ width: w, height: photoAreaH, backgroundColor: '#111' }} />}
            </View>
          ))}
        </View>
        {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic', marginTop: 6 }}>{caption}</Text>}
      </View>
    );
  }

  // Layout 4
  const cellW = (matW - PHOTO_GAP) / 2;
  const cellH = (photoAreaH - PHOTO_GAP) / 2;
  const hasFeatured = featuredIdx !== null && featuredIdx !== undefined
    && featuredIdx >= 0 && featuredIdx < photoUrls.length;

  if (hasFeatured) {
    const featuredUrl  = photoUrls[featuredIdx!];
    const rest         = photoUrls.filter((_, i) => i !== featuredIdx);
    const restCellW    = (matW - PHOTO_GAP * 2) / 3;
    return (
      <View style={matStyle}>
        <View style={{ flexDirection: 'column', gap: PHOTO_GAP }}>
          <View style={{ width: matW, height: cellH }}>
            {featuredUrl
              ? <Image src={featuredUrl} style={{ width: matW, height: cellH, objectFit: 'cover' }} />
              : <View style={{ width: matW, height: cellH, backgroundColor: '#111' }} />}
          </View>
          <View style={{ flexDirection: 'row', gap: PHOTO_GAP }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={{ width: restCellW, height: cellH }}>
                {rest[i]
                  ? <Image src={rest[i]} style={{ width: restCellW, height: cellH, objectFit: 'cover' }} />
                  : <View style={{ width: restCellW, height: cellH, backgroundColor: '#111' }} />}
              </View>
            ))}
          </View>
        </View>
        {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic', marginTop: 6 }}>{caption}</Text>}
      </View>
    );
  }

  return (
    <View style={matStyle}>
      <View style={{ flexDirection: 'column', gap: PHOTO_GAP }}>
        {[0, 2].map(rowStart => (
          <View key={rowStart} style={{ flexDirection: 'row', gap: PHOTO_GAP }}>
            {[0, 1].map(col => {
              const idx = rowStart + col;
              return (
                <View key={col} style={{ width: cellW, height: cellH }}>
                  {photoUrls[idx]
                    ? <Image src={photoUrls[idx]} style={{ width: cellW, height: cellH, objectFit: 'cover' }} />
                    : <View style={{ width: cellW, height: cellH, backgroundColor: '#111' }} />}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic', marginTop: 6 }}>{caption}</Text>}
    </View>
  );
}

// ── Lined page ─────────────────────────────────────────────────
function LinedPage({ theme, themeUrl }: { theme: string; themeUrl: string | null | undefined }) {
  const th = BOOK_THEMES[theme] ?? BOOK_THEMES.classic;
  const { w, h } = useContext(DimsCtx);
  const LINE_COUNT = 23;
  return (
    <Page size={[w, h]} style={{ backgroundColor: th.lineBg, width: w, height: h }}>
      <View style={{ flex: 1, paddingHorizontal: Math.round(w * 0.098), paddingTop: Math.round(h * 0.066), paddingBottom: Math.round(h * 0.061), flexDirection: 'column' }}>
        <Text style={{ fontSize: 20, color: th.accent, textAlign: 'center', marginBottom: 6, fontStyle: 'italic', letterSpacing: 1 }}>
          Messages of Love
        </Text>
        <View style={{ width: 44, height: 0.75, backgroundColor: th.accent, alignSelf: 'center', marginBottom: Math.round(h * 0.046), opacity: 0.55 }} />
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          {Array.from({ length: LINE_COUNT }).map((_, i) => (
            <View key={i} style={{ borderBottomWidth: 0.5, borderBottomColor: th.lineColor }} />
          ))}
        </View>
      </View>
      <Text style={{ position: 'absolute', bottom: 24, left: 0, right: 0, fontSize: 7, color: th.lineColor, textAlign: 'center', letterSpacing: 2.5, textTransform: 'uppercase' }}>
        Lumoriam
      </Text>
    </Page>
  );
}

// ── Front cover ────────────────────────────────────────────────
function CoverPage({
  name, yearsLabel, heroPhotoUrl, themePhotoUrl, accentColor,
}: {
  name: string; yearsLabel: string; heroPhotoUrl: string | null;
  themePhotoUrl: string | null | undefined; accentColor: string;
}) {
  const { w, h } = useContext(DimsCtx);
  const sceneUrl   = themePhotoUrl ? `${themePhotoUrl}?w=1224&q=90&fit=crop` : null;
  const coverPhW   = w * 0.82;
  const coverPhH   = h * 0.52;
  const textAreaH  = h * 0.27;

  return (
    <Page size={[w, h]} style={{ width: w, height: h, backgroundColor: '#1a1a1a' }}>
      {sceneUrl
        ? <Image src={sceneUrl} style={{ position: 'absolute', top: 0, left: 0, width: w, height: h, objectFit: 'cover' }} />
        : null}
      <View style={{ alignItems: 'center', paddingTop: h * 0.05 }}>
        <View style={{ backgroundColor: '#ffffff', padding: 16 }}>
          {heroPhotoUrl
            ? <Image src={heroPhotoUrl} style={{ width: coverPhW, height: coverPhH, objectFit: 'cover' }} />
            : <View style={{ width: coverPhW, height: coverPhH, backgroundColor: '#333' }} />}
        </View>
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: textAreaH, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 6 }}>
        <Text style={{ fontSize: 9, color: accentColor, letterSpacing: 3.5, textTransform: 'uppercase', textAlign: 'center' }}>
          In Loving Memory of
        </Text>
        <Text style={{ fontSize: 28, color: '#ffffff', fontWeight: 'bold', textAlign: 'center' }}>
          {name}
        </Text>
        {yearsLabel
          ? <Text style={{ fontSize: 13, color: '#e8e8e8', letterSpacing: 2, textAlign: 'center' }}>{yearsLabel}</Text>
          : null}
      </View>
      <Text style={{ position: 'absolute', bottom: 10, left: 0, right: 0, fontSize: 7, color: 'rgba(255,255,255,0.18)', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase' }}>
        Created with Lumoriam
      </Text>
    </Page>
  );
}

// ── Back cover ─────────────────────────────────────────────────
function BackCoverPage({
  backPhotoUrl, themePhotoUrl,
}: {
  backPhotoUrl: string | null | undefined;
  themePhotoUrl: string | null | undefined;
}) {
  const { w, h } = useContext(DimsCtx);
  const sceneUrl = themePhotoUrl ? `${themePhotoUrl}?w=1224&q=90&fit=crop` : null;
  const backPhW  = w * 0.74;
  const backPhH  = h * 0.54;

  return (
    <Page size={[w, h]} style={{ width: w, height: h, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
      {sceneUrl
        ? <Image src={sceneUrl} style={{ position: 'absolute', top: 0, left: 0, width: w, height: h, objectFit: 'cover' }} />
        : null}
      <View style={{ backgroundColor: '#ffffff', padding: 16 }}>
        {backPhotoUrl
          ? <Image src={backPhotoUrl} style={{ width: backPhW, height: backPhH, objectFit: 'cover' }} />
          : <View style={{ width: backPhW, height: backPhH, backgroundColor: '#333' }} />}
      </View>
      <Text style={{ position: 'absolute', bottom: 24, left: 0, right: 0, fontSize: 8, color: 'rgba(255,255,255,0.28)', textAlign: 'center', letterSpacing: 3.5, textTransform: 'uppercase' }}>
        Lumoriam
      </Text>
    </Page>
  );
}

// ── Main Document ──────────────────────────────────────────────
export function MemoryBookDocument({
  name,
  birthYear,
  deathYear,
  heroPhotoUrl,
  backCoverPhotoUrl,
  theme = 'classic',
  themePhotoUrl,
  pages,
  photoUrls = [],
  bookSize = '8x11',
  orientation = 'portrait',
}: MemoryBookProps) {
  const th   = BOOK_THEMES[theme] ?? BOOK_THEMES.classic;
  const dims = getDims(bookSize, orientation);
  const { w, h, margin, headerH } = dims;

  const yearsLabel =
    birthYear && deathYear ? `${birthYear} – ${deathYear}`
    : birthYear            ? `Born ${birthYear}`
    : deathYear            ? `${deathYear}`
    : '';

  let bookPages: BookPage[];
  if (pages && pages.length > 0) {
    bookPages = pages;
  } else {
    const interior = photoUrls.filter(u => u !== heroPhotoUrl);
    bookPages = [];
    for (let i = 0; i < interior.length; i += 4) {
      bookPages.push({ layout: 4, photoUrls: interior.slice(i, i + 4) });
    }
  }

  const pageStyle = {
    backgroundColor: '#1a1a1a',
    flexDirection: 'column' as const,
    padding: margin,
  };

  return (
    <DimsCtx.Provider value={dims}>
      <Document title={`Memory Book — ${name}`} author="Lumoriam">

        <CoverPage
          name={name}
          yearsLabel={yearsLabel}
          heroPhotoUrl={heroPhotoUrl}
          themePhotoUrl={themePhotoUrl}
          accentColor={th.accent}
        />

        {/* Blank signature page */}
        <Page size={[w, h]} style={{ backgroundColor: '#ffffff', width: w, height: h }} />

        {bookPages.map((pg, pageIndex) => (
          <React.Fragment key={pageIndex}>
            <Page size={[w, h]} style={pageStyle}>
              <Text style={{ fontSize: 8, color: '#b0a090', letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center', marginBottom: 16, height: headerH }}>
                {name} · Memories
              </Text>
              <PhotoGrid
                photoUrls={pg.photoUrls}
                layout={pg.layout}
                caption={pg.caption}
                featuredIdx={pg.featuredIdx}
              />
              <Text style={{ position: 'absolute', bottom: 16, left: 0, right: 0, fontSize: 7, color: '#c0b8a8', textAlign: 'center', letterSpacing: 1 }}>
                {pageIndex + 1} of {bookPages.length}
              </Text>
            </Page>
            <LinedPage theme={theme} themeUrl={themePhotoUrl} />
          </React.Fragment>
        ))}

        <BackCoverPage backPhotoUrl={backCoverPhotoUrl} themePhotoUrl={themePhotoUrl} />

      </Document>
    </DimsCtx.Provider>
  );
}
