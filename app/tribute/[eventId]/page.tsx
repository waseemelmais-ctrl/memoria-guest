'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db } from '../../../firebase';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PublicSettings {
  showVideo: boolean;
  showPhotos: boolean;
  showWall: boolean;
  showDate: boolean;
}

interface Tribute {
  lovedOneName: string;
  adminUserId: string;
  dateOfPassing?: string;
  tributeType?: string;
  speciesLabel?: string;
  speciesIcon?: string;
  lastFinalRenderUrl?: string;
  publicSettings?: PublicSettings;
  donationFundEnabled?: boolean;
  totalRaisedCents?: number;
  donationCount?: number;
}

interface Photo {
  id: string;
  url: string;
}

interface Condolence {
  id: string;
  name: string;
  message: string;
  createdAt: string;
  reactions?: Record<string, number>;
}

const AMOUNTS = [1000, 2500, 5000, 10000]; // cents: $10, $25, $50, $100

function DonationFormInner({ eventId, lovedOneName }: { eventId: string; lovedOneName: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [selectedCents, setSelectedCents] = useState<number>(2500);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [donorName, setDonorName] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'select' | 'pay' | 'success'>('select');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const effectiveCents = showCustom
    ? Math.round(parseFloat(customAmount || '0') * 100)
    : selectedCents;

  const handleContinue = async () => {
    const cents = effectiveCents;
    if (cents < 500) { setError('Minimum donation is $5'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/create-donation-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, amountCents: cents, donorName, message }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return; }
      setClientSecret(data.clientSecret);
      setStep('pay');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setLoading(true);
    setError('');
    const card = elements.getElement(CardElement);
    if (!card) return;
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    });
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setLoading(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      // Record the donation server-side
      try {
        await fetch('/api/record-donation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            eventId,
            donorName,
            message,
            amountCents: effectiveCents,
          }),
        });
      } catch { /* webhook will catch it as backup */ }
      setStep('success');
    }
    setLoading(false);
  };

  if (step === 'success') {
    return (
      <div style={sd.successBox}>
        <div style={sd.successStar}>✦</div>
        <p style={sd.successTitle}>Thank you{donorName ? `, ${donorName}` : ''}</p>
        <p style={sd.successSub}>
          Your donation of ${(effectiveCents / 100).toFixed(2)} has been received.
          {lovedOneName ? ` In honour of ${lovedOneName}.` : ''}
        </p>
      </div>
    );
  }

  if (step === 'pay') {
    return (
      <div style={sd.payBox}>
        <p style={sd.payAmount}>${(effectiveCents / 100).toFixed(2)} CAD</p>
        <div style={sd.cardWrap}>
          <CardElement options={{ style: { base: { color: '#e8e0d0', fontSize: '16px', '::placeholder': { color: '#444' } } } }} />
        </div>
        {error && <p style={sd.error}>{error}</p>}
        <button style={sd.payBtn} onClick={handlePay} disabled={loading || !stripe}>
          {loading ? 'Processing...' : `Donate $${(effectiveCents / 100).toFixed(2)}`}
        </button>
        <button style={sd.backBtn} onClick={() => setStep('select')} disabled={loading}>← Back</button>
      </div>
    );
  }

  return (
    <div>
      <div style={sd.amountRow}>
        {AMOUNTS.map(c => (
          <button
            key={c}
            style={{ ...sd.amountBtn, ...(selectedCents === c && !showCustom ? sd.amountBtnActive : {}) }}
            onClick={() => { setSelectedCents(c); setShowCustom(false); setError(''); }}
          >
            ${c / 100}
          </button>
        ))}
        <button
          style={{ ...sd.amountBtn, ...(showCustom ? sd.amountBtnActive : {}) }}
          onClick={() => setShowCustom(true)}
        >
          Other
        </button>
      </div>
      {showCustom && (
        <div style={sd.customRow}>
          <span style={sd.customDollar}>$</span>
          <input
            type="number"
            placeholder="Enter amount"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            style={sd.customInput}
            min="5"
          />
        </div>
      )}
      <input
        placeholder="Your name (optional)"
        value={donorName}
        onChange={e => setDonorName(e.target.value)}
        style={sd.field}
      />
      <textarea
        placeholder="Leave a message (optional)"
        value={message}
        onChange={e => setMessage(e.target.value)}
        style={{ ...sd.field, ...sd.textarea }}
        rows={3}
      />
      {error && <p style={sd.error}>{error}</p>}
      <button style={sd.payBtn} onClick={handleContinue} disabled={loading || effectiveCents < 500}>
        {loading ? 'Please wait...' : 'Continue to Payment'}
      </button>
    </div>
  );
}

function DonationSection({ eventId, lovedOneName, totalRaisedCents, donationCount }: {
  eventId: string;
  lovedOneName: string;
  totalRaisedCents?: number;
  donationCount?: number;
}) {
  const [clientSecret, setClientSecret] = useState('');
  // We load elements lazily after getting clientSecret
  const opts = clientSecret ? { clientSecret } : undefined;

  return (
    <section style={s.section}>
      <p style={s.sectionLabel}>TRIBUTE FUNDRAISER</p>
      {(totalRaisedCents ?? 0) > 0 && (
        <div style={sd.raisedBar}>
          <span style={sd.raisedAmount}>${((totalRaisedCents ?? 0) / 100).toFixed(2)}</span>
          <span style={sd.raisedLabel}> raised from {donationCount ?? 0} donation{donationCount !== 1 ? 's' : ''}</span>
        </div>
      )}
      <p style={sd.subtext}>
        Support the family of {lovedOneName}. 90% of every donation goes directly to them.
      </p>
      <Elements stripe={stripePromise}>
        <DonationFormInner eventId={eventId} lovedOneName={lovedOneName} />
      </Elements>
    </section>
  );
}

export default function TributePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = React.use(params);

  const [authReady, setAuthReady] = useState(false);
  const [tribute, setTribute] = useState<Tribute | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [condolences, setCondolences] = useState<Condolence[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setAuthReady(true);
      else signInAnonymously(auth).catch(console.error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !eventId) return;
    const load = async () => {
      try {
        const tributeSnap = await getDoc(doc(db, 'tributes', eventId));
        if (!tributeSnap.exists()) { setNotFound(true); setLoading(false); return; }
        const data = tributeSnap.data() as Tribute;
        setTribute(data);

        const [photosSnap, condolencesSnap] = await Promise.all([
          getDocs(query(collection(db, 'photos'), where('eventId', '==', eventId))),
          getDocs(query(collection(db, 'condolences'), where('eventId', '==', eventId))),
        ]);

        setPhotos(photosSnap.docs.map(d => ({ id: d.id, ...d.data() } as Photo)));
        setCondolences(
          condolencesSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as Condolence))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      } catch (e: any) {
        console.error('Tribute load error:', e?.message ?? e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authReady, eventId]);

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <div style={s.goldStar}>✦</div>
          <p style={s.loadingText}>Loading tribute...</p>
        </div>
      </div>
    );
  }

  if (notFound || !tribute) {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <div style={s.goldStar}>✦</div>
          <h1 style={s.appName}>MEMORIAM</h1>
          <p style={s.mutedText}>This tribute could not be found. The link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  const isPet = tribute.tributeType === 'pet';
  const passingYear = tribute.dateOfPassing ? new Date(tribute.dateOfPassing).getFullYear() : null;
  const ps = tribute.publicSettings ?? { showVideo: true, showPhotos: true, showWall: true, showDate: true };
  const previewPhotos = photos.slice(0, 4);
  const hasMore = photos.length > 4;

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* ── Header ── */}
        <div style={s.header}>
          <span style={s.goldStar}>✦</span>
          <span style={s.appLabel}>MEMORIAM</span>
        </div>

        {/* ── Hero ── */}
        <div style={s.hero}>
          <p style={s.inMemoryOf}>{isPet ? 'IN LOVING MEMORY OF' : 'IN MEMORY OF'}</p>
          <h1 style={s.heroName}>
            {isPet && tribute.speciesIcon && `${tribute.speciesIcon} `}{tribute.lovedOneName}
          </h1>
          {passingYear && ps.showDate && (
            <p style={s.heroSub}>
              {isPet && tribute.speciesLabel ? `${tribute.speciesLabel} · ` : ''}Passed {passingYear}
            </p>
          )}
          <div style={s.divider} />
        </div>

        {/* ── Tribute Video ── */}
        {ps.showVideo && tribute.lastFinalRenderUrl && (
          <section style={s.section}>
            <p style={s.sectionLabel}>TRIBUTE VIDEO</p>
            <video
              src={tribute.lastFinalRenderUrl}
              controls
              playsInline
              style={s.video}
            />
          </section>
        )}

        {/* ── Photo Gallery Teaser ── */}
        {ps.showPhotos && photos.length > 0 && (
          <section style={s.section}>
            <p style={s.sectionLabel}>PHOTOS</p>
            <div style={s.photoGrid}>
              {previewPhotos.map((photo, i) => (
                <div key={photo.id} style={s.photoCell}>
                  <img
                    src={photo.url.replace('/upload/', '/upload/w_300,h_300,c_fill,q_70,f_auto/')}
                    alt=""
                    style={s.photoImg}
                  />
                  {/* Blur + lock overlay on last photo if more exist */}
                  {i === 3 && hasMore && (
                    <div style={s.photoLock}>
                      <span style={s.photoLockIcon}>🔒</span>
                      <span style={s.photoLockText}>+{photos.length - 3} more</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <a href="https://apps.apple.com/app/memoriam" target="_blank" rel="noopener noreferrer" style={s.galleryPrompt}>
              View all {photos.length} photos in the Memoriam app →
            </a>
          </section>
        )}

        {/* ── Condolence Wall (read-only) ── */}
        {ps.showWall && condolences.length > 0 && (
          <section style={s.section}>
            <p style={s.sectionLabel}>CONDOLENCE WALL</p>
            <div style={s.condolenceList}>
              {condolences.map(c => (
                <div key={c.id} style={s.condolenceCard}>
                  <p style={s.condolenceName}>{c.name}</p>
                  <p style={s.condolenceMessage}>{c.message}</p>
                  <div style={s.condolenceFooter}>
                    <span style={s.condolenceDate}>
                      {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                    {c.reactions && (
                      <span style={s.reactions}>
                        {Object.entries(c.reactions)
                          .filter(([, count]) => count > 0)
                          .map(([emoji, count]) => (
                            <span key={emoji} style={s.reactionPill}>{emoji} {count}</span>
                          ))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Donation Fund ── */}
        {tribute.donationFundEnabled && (
          <DonationSection
            eventId={eventId}
            lovedOneName={tribute.lovedOneName}
            totalRaisedCents={tribute.totalRaisedCents}
            donationCount={tribute.donationCount}
          />
        )}

        {/* ── App Download CTA ── */}
        <section style={s.ctaSection}>
          <div style={s.ctaCard}>
            <div style={s.goldStar}>✦</div>
            <h3 style={s.ctaTitle}>View the full tribute</h3>
            <p style={s.ctaSubtitle}>
              Download Memoriam to view all photos, join the tribute, and honour {tribute.lovedOneName}'s memory.
            </p>
            <a
              href={`memoriam://join/${eventId}`}
              style={s.btnGold}
            >
              Open in Memoriam App
            </a>
            <a
              href="https://apps.apple.com/app/memoriam"
              target="_blank"
              rel="noopener noreferrer"
              style={s.btnOutline}
            >
              Download on the App Store
            </a>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={s.footer}>
          <p style={s.footerText}>Made with Memoriam · memoriam.app</p>
        </footer>

      </div>
    </div>
  );
}

const s: { [key: string]: React.CSSProperties } = {
  page: { minHeight: '100vh', backgroundColor: '#0a0a0a', fontFamily: 'Georgia, serif' },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '24px', textAlign: 'center' },
  container: { maxWidth: '640px', margin: '0 auto', padding: '0 20px 60px' },

  // Header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', paddingTop: '36px', paddingBottom: '8px' },
  appLabel: { color: '#c9a96e', fontSize: '11px', letterSpacing: '6px', fontFamily: 'sans-serif', fontWeight: 300 },

  // Hero
  hero: { textAlign: 'center', padding: '44px 0 24px' },
  inMemoryOf: { color: '#555', fontSize: '10px', letterSpacing: '4px', textTransform: 'uppercase' as const, marginBottom: '16px', fontFamily: 'sans-serif' },
  heroName: { color: '#e8e0d0', fontSize: '36px', fontWeight: 300, letterSpacing: '1px', marginBottom: '12px', lineHeight: 1.2 },
  heroSub: { color: '#555', fontSize: '13px', letterSpacing: '2px', fontFamily: 'sans-serif', marginBottom: '24px' },
  divider: { width: '50px', height: '1px', backgroundColor: '#c9a96e', margin: '0 auto', opacity: 0.4 },

  // Sections
  section: { marginTop: '52px' },
  sectionLabel: { color: '#444', fontSize: '10px', letterSpacing: '4px', fontFamily: 'sans-serif', fontWeight: 400, marginBottom: '20px', textTransform: 'uppercase' as const },

  // Video
  video: { width: '100%', borderRadius: '12px', backgroundColor: '#000', display: 'block' },

  // Photos
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '14px' },
  photoCell: { position: 'relative' as const, aspectRatio: '1', overflow: 'hidden', backgroundColor: '#111' },
  photoImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
  photoLock: { position: 'absolute' as const, inset: 0, backgroundColor: 'rgba(10,10,10,0.75)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '6px' },
  photoLockIcon: { fontSize: '22px' },
  photoLockText: { color: '#c9a96e', fontSize: '13px', fontFamily: 'sans-serif', fontWeight: 600 },
  galleryPrompt: { color: '#c9a96e', fontSize: '12px', fontFamily: 'sans-serif', textDecoration: 'none', letterSpacing: '0.5px' },

  // Condolences
  condolenceList: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  condolenceCard: { backgroundColor: '#111', border: '1px solid #1a1a1a', borderRadius: '12px', padding: '18px' },
  condolenceName: { color: '#c9a96e', fontSize: '12px', fontWeight: 600, marginBottom: '8px', fontFamily: 'sans-serif', letterSpacing: '0.5px' },
  condolenceMessage: { color: '#bbb', fontSize: '15px', lineHeight: 1.7, marginBottom: '10px' },
  condolenceFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '6px' },
  condolenceDate: { color: '#333', fontSize: '11px', fontFamily: 'sans-serif' },
  reactions: { display: 'flex', gap: '6px' },
  reactionPill: { backgroundColor: '#1a1a1a', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', color: '#555', fontFamily: 'sans-serif' },

  // CTA
  ctaSection: { marginTop: '64px' },
  ctaCard: { backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '20px', padding: '36px 24px', textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, gap: '12px', alignItems: 'center' },
  ctaTitle: { color: '#e8e0d0', fontSize: '20px', fontWeight: 300, letterSpacing: '1px', margin: 0 },
  ctaSubtitle: { color: '#555', fontSize: '13px', lineHeight: 1.7, fontFamily: 'sans-serif', margin: 0 },
  btnGold: { display: 'block', width: '100%', boxSizing: 'border-box' as const, backgroundColor: '#c9a96e', color: '#0a0a0a', borderRadius: '12px', padding: '15px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, textDecoration: 'none', fontFamily: 'sans-serif' },
  btnOutline: { display: 'block', width: '100%', boxSizing: 'border-box' as const, backgroundColor: 'transparent', color: '#444', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '13px', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' as const, textDecoration: 'none', fontFamily: 'sans-serif' },

  // Footer
  footer: { marginTop: '56px', textAlign: 'center' as const },
  footerText: { color: '#222', fontSize: '11px', letterSpacing: '2px', fontFamily: 'sans-serif' },

  // Shared
  goldStar: { color: '#c9a96e', fontSize: '24px' },
  appName: { color: '#c9a96e', fontSize: '22px', letterSpacing: '6px', fontWeight: 300, textTransform: 'uppercase' as const },
  mutedText: { color: '#444', fontSize: '14px', lineHeight: 1.7, fontFamily: 'sans-serif' },
  loadingText: { color: '#333', fontSize: '12px', letterSpacing: '2px', fontFamily: 'sans-serif' },
};

// Donation-specific styles
const sd: { [key: string]: React.CSSProperties } = {
  raisedBar: { marginBottom: '16px', display: 'flex', alignItems: 'baseline', gap: '4px' },
  raisedAmount: { color: '#c9a96e', fontSize: '28px', fontFamily: 'Georgia, serif', fontWeight: 300 },
  raisedLabel: { color: '#555', fontSize: '12px', fontFamily: 'sans-serif' },
  subtext: { color: '#555', fontSize: '13px', lineHeight: 1.7, fontFamily: 'sans-serif', marginBottom: '20px' },
  amountRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '16px' },
  amountBtn: { flex: '1 1 auto', minWidth: '60px', padding: '12px 8px', backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '10px', color: '#888', fontSize: '14px', fontFamily: 'sans-serif', cursor: 'pointer' },
  amountBtnActive: { backgroundColor: '#1a1506', border: '1px solid #c9a96e', color: '#c9a96e' },
  customRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', backgroundColor: '#111', border: '1px solid #222', borderRadius: '10px', padding: '4px 14px' },
  customDollar: { color: '#c9a96e', fontSize: '16px', fontFamily: 'sans-serif' },
  customInput: { flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', color: '#e8e0d0', fontSize: '16px', fontFamily: 'sans-serif', padding: '10px 0' },
  field: { width: '100%', boxSizing: 'border-box' as const, backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '14px', color: '#e8e0d0', fontSize: '14px', fontFamily: 'sans-serif', marginBottom: '12px', outline: 'none' },
  textarea: { resize: 'none' as const },
  payBtn: { width: '100%', backgroundColor: '#c9a96e', color: '#0a0a0a', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'sans-serif', marginTop: '4px' },
  backBtn: { background: 'none', border: 'none', color: '#444', fontSize: '12px', cursor: 'pointer', fontFamily: 'sans-serif', marginTop: '12px', letterSpacing: '1px' },
  cardWrap: { backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '16px', marginBottom: '16px' },
  payBox: { display: 'flex', flexDirection: 'column' as const },
  payAmount: { color: '#e8e0d0', fontSize: '24px', fontFamily: 'Georgia, serif', fontWeight: 300, marginBottom: '16px', textAlign: 'center' as const },
  error: { color: '#e05c5c', fontSize: '12px', fontFamily: 'sans-serif', marginBottom: '12px' },
  successBox: { textAlign: 'center' as const, padding: '32px 0' },
  successStar: { color: '#c9a96e', fontSize: '32px', marginBottom: '16px' },
  successTitle: { color: '#e8e0d0', fontSize: '22px', fontFamily: 'Georgia, serif', fontWeight: 300, marginBottom: '8px' },
  successSub: { color: '#555', fontSize: '13px', fontFamily: 'sans-serif', lineHeight: 1.7 },
};
