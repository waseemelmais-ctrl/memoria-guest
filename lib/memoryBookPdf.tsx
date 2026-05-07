import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

const styles = StyleSheet.create({
  // ── Cover ──────────────────────────────────────────────
  coverPage: {
    backgroundColor: '#1a1a1a',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  coverHero: {
    width: 320,
    height: 320,
    borderRadius: 8,
    objectFit: 'cover',
    marginBottom: 36,
    borderWidth: 3,
    borderColor: '#c9a96e',
  },
  coverPlaceholder: {
    width: 320,
    height: 320,
    borderRadius: 8,
    marginBottom: 36,
    backgroundColor: '#2c2c2c',
    borderWidth: 3,
    borderColor: '#c9a96e',
  },
  coverTagline: {
    fontSize: 11,
    color: '#c9a96e',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  coverName: {
    fontSize: 32,
    color: '#f5f0e8',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  coverYears: {
    fontSize: 16,
    color: '#a89070',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 48,
  },
  coverDivider: {
    width: 60,
    height: 1,
    backgroundColor: '#c9a96e',
    marginBottom: 48,
  },
  coverFooter: {
    fontSize: 9,
    color: '#555',
    letterSpacing: 2,
    textTransform: 'uppercase',
    position: 'absolute',
    bottom: 32,
  },

  // ── Photo pages ─────────────────────────────────────────
  photoPage: {
    backgroundColor: '#f8f6f2',
    padding: 32,
    flexDirection: 'column',
  },
  pageHeader: {
    fontSize: 8,
    color: '#b0a090',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 20,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  photoCell: {
    width: '47%',
    aspectRatio: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 4,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    fontSize: 8,
    color: '#c0b8a8',
    textAlign: 'center',
    letterSpacing: 1,
  },

  // ── Back cover ──────────────────────────────────────────
  backPage: {
    backgroundColor: '#1a1a1a',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  backText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 1.8,
    marginBottom: 12,
  },
  backBrand: {
    fontSize: 10,
    color: '#555',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 32,
  },
});

interface MemoryBookProps {
  name: string;
  birthYear: string | number;
  deathYear: string | number;
  heroPhotoUrl: string | null;
  photoUrls: string[];
  condolenceMessages?: { name: string; message: string }[];
  photosPerPage?: 1 | 2 | 4;
}

// Chunk photos into pages of 4
function chunkPhotos(urls: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < urls.length; i += size) {
    chunks.push(urls.slice(i, i + size));
  }
  return chunks;
}

export function MemoryBookDocument({
  name,
  birthYear,
  deathYear,
  heroPhotoUrl,
  photoUrls,
  condolenceMessages = [],
  photosPerPage = 4,
}: MemoryBookProps) {
  const yearsLabel =
    birthYear && deathYear
      ? `${birthYear} – ${deathYear}`
      : birthYear
      ? `Born ${birthYear}`
      : deathYear
      ? `${deathYear}`
      : '';

  // Exclude hero from interior pages
  const interiorPhotos = photoUrls.filter(u => u !== heroPhotoUrl);
  const chunkSize = photosPerPage as number;
  const photoPages = chunkPhotos(interiorPhotos, chunkSize);
  const hasWall = condolenceMessages.length > 0;
  // Layout: 1=single full-width, 2=side-by-side, 4=2x2 grid
  const photoWidth = photosPerPage === 1 ? '90%' : '47%';

  return (
    <Document title={`Memory Book — ${name}`} author="Memoriam">
      {/* ── Cover ── */}
      <Page size="LETTER" style={styles.coverPage}>
        {heroPhotoUrl ? (
          <Image src={heroPhotoUrl} style={styles.coverHero} />
        ) : (
          <View style={styles.coverPlaceholder} />
        )}
        <Text style={styles.coverTagline}>In Loving Memory</Text>
        <Text style={styles.coverName}>{name}</Text>
        {yearsLabel ? <Text style={styles.coverYears}>{yearsLabel}</Text> : null}
        <View style={styles.coverDivider} />
        <Text style={styles.coverFooter}>Created with Memoriam</Text>
      </Page>

      {/* ── Condolence Wall page ── */}
      {hasWall && (
        <Page size="LETTER" style={styles.photoPage}>
          <Text style={styles.pageHeader}>Messages of Love</Text>
          <View style={{ gap: 14 }}>
            {condolenceMessages.map((msg, i) => (
              <View key={i} style={{ borderBottomWidth: i < condolenceMessages.length - 1 ? 1 : 0, borderBottomColor: '#e8e4dc', paddingBottom: 12 }}>
                <Text style={{ fontSize: 11, color: '#c9a96e', fontWeight: 'bold', marginBottom: 4 }}>{msg.name}</Text>
                <Text style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>{msg.message}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}

      {/* ── Photo pages ── */}
      {photoPages.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="LETTER" style={styles.photoPage}>
          <Text style={styles.pageHeader}>{name} · Memories</Text>
          <View style={styles.photoGrid}>
            {chunk.map((url, i) => (
              <View key={i} style={[styles.photoCell, { width: photoWidth }]}>
                <Image src={url} style={styles.photo} />
              </View>
            ))}
          </View>
          <Text style={styles.pageFooter}>
            {pageIndex + 1} of {photoPages.length}
          </Text>
        </Page>
      ))}

      {/* ── Back cover ── */}
      <Page size="LETTER" style={styles.backPage}>
        <Text style={styles.backText}>
          {'Every photo in this book carries a memory.\nThank you for keeping it alive.'}
        </Text>
        <Text style={styles.backBrand}>Memoriam</Text>
      </Page>
    </Document>
  );
}
