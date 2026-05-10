import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

// ── Page dimensions (LETTER) ─────────────────────────────────
// 8.5" × 11" at 72dpi = 612 × 792pt
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN  = 28;
const HEADER_H = 20;
const FOOTER_H = 16;
const PHOTO_GAP = 6;
const MAT = 12; // white mat border around interior photos

// Cover layout constants
const COVER_MAT      = 16;                        // white mat around cover photo
const COVER_PHOTO_W  = PAGE_W * 0.82;             // photo inside mat
const COVER_PHOTO_H  = PAGE_H * 0.52;             // photo inside mat
const TEXT_AREA_H    = PAGE_H * 0.27;             // dark overlay strip height

// ── Themes ───────────────────────────────────────────────────
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

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Signature page (blank white)
  signaturePage: {
    backgroundColor: '#ffffff',
    width: PAGE_W,
    height: PAGE_H,
  },

  // Interior photo page wrapper
  photoPage: {
    backgroundColor: '#1a1a1a',
    flexDirection: 'column',
    padding: MARGIN,
  },

  // Page header / footer
  pageHeader: {
    fontSize: 8,
    color: '#b0a090',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 16,
    height: HEADER_H,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    fontSize: 7,
    color: '#c0b8a8',
    textAlign: 'center',
    letterSpacing: 1,
  },
});

// ── Types ─────────────────────────────────────────────────────
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
}

// ── Interior photo grid helpers ───────────────────────────────
const contentW = PAGE_W - MARGIN * 2;
const contentH = PAGE_H - MARGIN * 2 - HEADER_H - FOOTER_H;
const CAPTION_H = 18;
const matW = contentW - MAT * 2;
const matH = contentH - MAT * 2;

interface PhotoGridProps {
  photoUrls: string[];
  layout: 1 | 2 | 4;
  caption?: string;
  featuredIdx?: number | null;
}

function PhotoGrid({ photoUrls, layout, caption, featuredIdx }: PhotoGridProps) {
  const hasCaption = !!caption;
  const photoAreaH = hasCaption ? matH - CAPTION_H - 6 : matH;

  const matStyle = { backgroundColor: '#ffffff', padding: MAT, flex: 1 };

  if (layout === 1) {
    return (
      <View style={matStyle}>
        <View style={{ flexDirection: 'column', gap: 6 }}>
          <View style={{ width: matW, height: photoAreaH }}>
            {photoUrls[0]
              ? <Image src={photoUrls[0]} style={{ width: matW, height: photoAreaH, objectFit: 'cover' }} />
              : <View style={{ width: matW, height: photoAreaH, backgroundColor: '#111' }} />}
          </View>
          {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic' }}>{caption}</Text>}
        </View>
      </View>
    );
  }

  if (layout === 2) {
    const halfW = (matW - PHOTO_GAP) / 2;
    const w0 = featuredIdx === 1 ? matW * 0.35 - PHOTO_GAP / 2 : featuredIdx === 0 ? matW * 0.65 - PHOTO_GAP / 2 : halfW;
    const w1 = matW - PHOTO_GAP - w0;
    return (
      <View style={matStyle}>
        <View style={{ flexDirection: 'column', gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: PHOTO_GAP }}>
            {[w0, w1].map((w, i) => (
              <View key={i} style={{ width: w, height: photoAreaH }}>
                {photoUrls[i]
                  ? <Image src={photoUrls[i]} style={{ width: w, height: photoAreaH, objectFit: 'cover' }} />
                  : <View style={{ width: w, height: photoAreaH, backgroundColor: '#111' }} />}
              </View>
            ))}
          </View>
          {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic' }}>{caption}</Text>}
        </View>
      </View>
    );
  }

  // Layout 4
  const cellW = (matW - PHOTO_GAP) / 2;
  const cellH = (photoAreaH - PHOTO_GAP) / 2;
  const hasFeatured = featuredIdx !== null && featuredIdx !== undefined && featuredIdx >= 0 && featuredIdx < photoUrls.length;

  if (hasFeatured) {
    const featuredUrl = photoUrls[featuredIdx!];
    const rest = photoUrls.filter((_, i) => i !== featuredIdx);
    const restCellW = (matW - PHOTO_GAP * 2) / 3;
    return (
      <View style={matStyle}>
        <View style={{ flexDirection: 'column', gap: 6 }}>
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
          {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic' }}>{caption}</Text>}
        </View>
      </View>
    );
  }

  // Standard 2×2
  return (
    <View style={matStyle}>
      <View style={{ flexDirection: 'column', gap: 6 }}>
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
        {hasCaption && <Text style={{ fontSize: 9, color: '#555', textAlign: 'center', fontStyle: 'italic' }}>{caption}</Text>}
      </View>
    </View>
  );
}

// ── Lined "Messages of Love" companion page ───────────────────
function LinedPage({ theme, themeUrl }: { theme: string; themeUrl: string | null | undefined }) {
  const th = BOOK_THEMES[theme] ?? BOOK_THEMES.classic;
  const LINE_COUNT = 23;

  return (
    <Page size="LETTER" style={{ backgroundColor: th.lineBg, width: PAGE_W, height: PAGE_H }}>
      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: 60, paddingTop: 52, paddingBottom: 48, flexDirection: 'column' }}>
        {/* Header */}
        <Text style={{ fontSize: 20, color: th.accent, textAlign: 'center', marginBottom: 6, fontStyle: 'italic', letterSpacing: 1 }}>
          Messages of Love
        </Text>
        <View style={{ width: 44, height: 0.75, backgroundColor: th.accent, alignSelf: 'center', marginBottom: 36, opacity: 0.55 }} />

        {/* Lines — flex distributes evenly across remaining height */}
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          {Array.from({ length: LINE_COUNT }).map((_, i) => (
            <View key={i} style={{ borderBottomWidth: 0.5, borderBottomColor: th.lineColor }} />
          ))}
        </View>
      </View>

      {/* Footer brand */}
      <Text style={{ position: 'absolute', bottom: 24, left: 0, right: 0, fontSize: 7, color: th.lineColor, textAlign: 'center', letterSpacing: 2.5, textTransform: 'uppercase' }}>
        Memoriam
      </Text>
    </Page>
  );
}

// ── Front Cover ───────────────────────────────────────────────
function CoverPage({
  name, yearsLabel, heroPhotoUrl, themePhotoUrl, accentColor,
}: {
  name: string; yearsLabel: string; heroPhotoUrl: string | null;
  themePhotoUrl: string | null | undefined; accentColor: string;
}) {
  const sceneUrl = themePhotoUrl ? `${themePhotoUrl}?w=1224&q=90&fit=crop` : null;

  return (
    <Page size="LETTER" style={{ width: PAGE_W, height: PAGE_H, backgroundColor: '#1a1a1a' }}>
      {/* Full-bleed scene background */}
      {sceneUrl ? (
        <Image src={sceneUrl} style={{ position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H, objectFit: 'cover' }} />
      ) : null}

      {/* Hero photo with white mat — upper portion */}
      <View style={{ alignItems: 'center', paddingTop: PAGE_H * 0.05 }}>
        <View style={{ backgroundColor: '#ffffff', padding: COVER_MAT }}>
          {heroPhotoUrl ? (
            <Image src={heroPhotoUrl} style={{ width: COVER_PHOTO_W, height: COVER_PHOTO_H, objectFit: 'cover' }} />
          ) : (
            <View style={{ width: COVER_PHOTO_W, height: COVER_PHOTO_H, backgroundColor: '#333' }} />
          )}
        </View>
      </View>

      {/* Dark overlay strip — text lives here */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: TEXT_AREA_H,
        backgroundColor: 'rgba(0,0,0,0.62)',
        justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 40, gap: 6,
      }}>
        <Text style={{ fontSize: 9, color: accentColor, letterSpacing: 3.5, textTransform: 'uppercase', textAlign: 'center' }}>
          In Loving Memory of
        </Text>
        <Text style={{ fontSize: 28, color: '#ffffff', fontWeight: 'bold', textAlign: 'center' }}>
          {name}
        </Text>
        {yearsLabel ? (
          <Text style={{ fontSize: 13, color: '#e8e8e8', letterSpacing: 2, textAlign: 'center' }}>
            {yearsLabel}
          </Text>
        ) : null}
      </View>

      {/* Subtle brand */}
      <Text style={{ position: 'absolute', bottom: 10, left: 0, right: 0, fontSize: 7, color: 'rgba(255,255,255,0.18)', textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase' }}>
        Created with Memoriam
      </Text>
    </Page>
  );
}

// ── Back Cover ────────────────────────────────────────────────
function BackCoverPage({
  backPhotoUrl, themePhotoUrl,
}: {
  backPhotoUrl: string | null | undefined;
  themePhotoUrl: string | null | undefined;
}) {
  const sceneUrl = themePhotoUrl ? `${themePhotoUrl}?w=1224&q=90&fit=crop` : null;
  const backPhW  = PAGE_W * 0.74;
  const backPhH  = PAGE_H * 0.54;

  return (
    <Page size="LETTER" style={{ width: PAGE_W, height: PAGE_H, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
      {/* Full-bleed scene background */}
      {sceneUrl ? (
        <Image src={sceneUrl} style={{ position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H, objectFit: 'cover' }} />
      ) : null}

      {/* Back cover photo with white mat — centered */}
      <View style={{ backgroundColor: '#ffffff', padding: COVER_MAT }}>
        {backPhotoUrl ? (
          <Image src={backPhotoUrl} style={{ width: backPhW, height: backPhH, objectFit: 'cover' }} />
        ) : (
          <View style={{ width: backPhW, height: backPhH, backgroundColor: '#333' }} />
        )}
      </View>

      {/* Subtle brand at very bottom */}
      <Text style={{ position: 'absolute', bottom: 24, left: 0, right: 0, fontSize: 8, color: 'rgba(255,255,255,0.28)', textAlign: 'center', letterSpacing: 3.5, textTransform: 'uppercase' }}>
        Memoriam
      </Text>
    </Page>
  );
}

// ── Main Document ─────────────────────────────────────────────
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
}: MemoryBookProps) {
  const th = BOOK_THEMES[theme] ?? BOOK_THEMES.classic;

  const yearsLabel =
    birthYear && deathYear ? `${birthYear} – ${deathYear}`
    : birthYear            ? `Born ${birthYear}`
    : deathYear            ? `${deathYear}`
    : '';

  // Build page list — prefer explicit pages, fall back to 4-per-page chunks
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

  return (
    <Document title={`Memory Book — ${name}`} author="Memoriam">

      {/* ── Front Cover ── */}
      <CoverPage
        name={name}
        yearsLabel={yearsLabel}
        heroPhotoUrl={heroPhotoUrl}
        themePhotoUrl={themePhotoUrl}
        accentColor={th.accent}
      />

      {/* ── Page 2: Blank Signature Page ── */}
      <Page size="LETTER" style={styles.signaturePage} />

      {/* ── Photo pages + Messages of Love companion pages ── */}
      {bookPages.map((pg, pageIndex) => (
        <React.Fragment key={pageIndex}>
          <Page size="LETTER" style={styles.photoPage}>
            <Text style={styles.pageHeader}>{name} · Memories</Text>
            <PhotoGrid
              photoUrls={pg.photoUrls}
              layout={pg.layout}
              caption={pg.caption}
              featuredIdx={pg.featuredIdx}
            />
            <Text style={styles.pageFooter}>
              {pageIndex + 1} of {bookPages.length}
            </Text>
          </Page>

          <LinedPage theme={theme} themeUrl={themePhotoUrl} />
        </React.Fragment>
      ))}

      {/* ── Back Cover ── */}
      <BackCoverPage backPhotoUrl={backCoverPhotoUrl} themePhotoUrl={themePhotoUrl} />

    </Document>
  );
}
