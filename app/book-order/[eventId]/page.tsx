'use client';

import React, { useState, useEffect } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const CARD_STYLE = {
  style: {
    base: {
      fontSize: '16px',
      color: '#2c2c2c',
      fontFamily: 'Georgia, serif',
      '::placeholder': { color: '#aaa' },
    },
    invalid: { color: '#e05252' },
  },
};

type OrderType = 'pdf' | 'print';
type CoverType = 'softcover' | 'hardcover';

interface PricingData {
  softcover: number | null;
  hardcover: number;
  softcoverAvailable: boolean;
  bookSize: string;
  orientation: string;
  currency: string;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '16px 0 24px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === step ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i + 1 === step ? '#c9a96e' : '#e0ddd8',
            transition: 'all 0.3s',
          }}
        />
      ))}
    </div>
  );
}

// ── PDF Order Form ─────────────────────────────────────────────────────────────
function PdfOrderForm({ eventId, tributeName }: { eventId: string; tributeName: string }) {
  const stripe = useStripe();
  const elements = useElements();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError('');
    try {
      const intentRes = await fetch('/api/create-book-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, email, tributeName }),
      });
      const { clientSecret, error: intentError } = await intentRes.json();
      if (intentError) throw new Error(intentError);

      const cardElement = elements.getElement(CardElement);
      const { paymentIntent, error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement! },
      });
      if (stripeError) throw new Error(stripeError.message);
      if (paymentIntent?.status !== 'succeeded') throw new Error('Payment did not complete.');

      const genRes = await fetch('/api/generate-book-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      });
      const genData = await genRes.json();
      if (!genData.ok && !genData.alreadyProcessed) throw new Error('PDF generation failed.');

      setDone(true);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (done) return <SuccessCard email={email} type="pdf" />;

  return (
    <div>
      <StepDots step={step} total={2} />
      {step === 1 && (
        <div style={s.stepCard}>
          <p style={s.stepLabel}>Step 1 of 2</p>
          <h2 style={s.stepTitle}>Where should we send your PDF?</h2>
          <p style={s.stepDesc}>Your memory book will be emailed as a print-ready PDF.</p>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(''); }}
            onKeyDown={e => e.key === 'Enter' && (validateEmail(email) ? setStep(2) : setEmailError('Please enter a valid email address.'))}
            style={{ ...s.input, ...(emailError ? s.inputError : {}) }}
            autoComplete="email"
          />
          {emailError && <p style={s.fieldError}>{emailError}</p>}
          <button
            onClick={() => {
              if (!validateEmail(email)) { setEmailError('Please enter a valid email address.'); return; }
              setEmailError('');
              setStep(2);
            }}
            style={s.btn}
          >
            Continue →
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={s.stepCard}>
          <p style={s.stepLabel}>Step 2 of 2</p>
          <h2 style={s.stepTitle}>Payment</h2>
          <div style={s.summaryRow}><span style={s.summaryLabel}>Print-It-Yourself PDF</span><span style={s.summaryPrice}>$4.99 USD</span></div>
          <div style={s.summaryRow}><span style={s.summaryLabel}>Delivery</span><span style={s.summaryPrice}>Email</span></div>
          <div style={s.cardBox}>
            <CardElement options={CARD_STYLE} onChange={e => setCardComplete(e.complete)} />
          </div>
          {error && <p style={s.fieldError}>{error}</p>}
          <button
            onClick={handlePay}
            disabled={!cardComplete || processing}
            style={{ ...s.btn, ...(!cardComplete || processing ? s.btnDisabled : {}) }}
          >
            {processing ? 'Processing…' : 'Pay $4.99 & Get PDF'}
          </button>
          <button onClick={() => setStep(1)} style={s.backBtn}>← Change email</button>
        </div>
      )}
    </div>
  );
}

// ── Print Order Form ───────────────────────────────────────────────────────────
function PrintOrderForm({
  eventId,
  tributeName,
  coverType,
  priceCents,
}: {
  eventId: string;
  tributeName: string;
  coverType: CoverType;
  priceCents: number;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [address, setAddress] = useState({
    firstName: '', lastName: '', addressLine1: '', addressLine2: '',
    city: '', province: '', postalCode: '', country: 'CA',
  });
  const [addressErrors, setAddressErrors] = useState<Record<string, string>>({});
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // Server confirms the real amount at payment-intent creation time
  const [confirmedCents, setConfirmedCents] = useState(priceCents);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const validateAddress = () => {
    const errors: Record<string, string> = {};
    if (!address.firstName.trim()) errors.firstName = 'Required';
    if (!address.lastName.trim()) errors.lastName = 'Required';
    if (!address.addressLine1.trim()) errors.addressLine1 = 'Required';
    if (!address.city.trim()) errors.city = 'Required';
    if (!address.province.trim()) errors.province = 'Required';
    if (!address.postalCode.trim()) errors.postalCode = 'Required';
    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError('');
    try {
      const intentRes = await fetch('/api/create-print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, email, tributeName, shippingAddress: address, coverType }),
      });
      const { clientSecret, amountCents, error: intentError } = await intentRes.json();
      if (intentError) throw new Error(intentError);
      if (amountCents) setConfirmedCents(amountCents);

      const cardElement = elements.getElement(CardElement);
      const { paymentIntent, error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement! },
      });
      if (stripeError) throw new Error(stripeError.message);
      if (paymentIntent?.status !== 'succeeded') throw new Error('Payment did not complete.');

      const fulfillRes = await fetch('/api/fulfill-print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      });
      const fulfillData = await fulfillRes.json();
      if (!fulfillData.ok && !fulfillData.alreadyProcessed) throw new Error('Order submission failed.');

      setDone(true);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (done) return <SuccessCard email={email} type="print" />;

  const priceStr = formatPrice(confirmedCents);
  const coverLabel = coverType === 'hardcover' ? 'Hard Cover' : 'Soft Cover';

  const field = (key: keyof typeof address, label: string, placeholder: string, half = false) => (
    <div style={{ width: half ? 'calc(50% - 4px)' : '100%' }}>
      <input
        type="text"
        placeholder={label}
        value={address[key]}
        onChange={e => { setAddress(a => ({ ...a, [key]: e.target.value })); setAddressErrors(ae => ({ ...ae, [key]: '' })); }}
        style={{ ...s.input, ...(addressErrors[key] ? s.inputError : {}), marginBottom: 8 }}
        autoComplete={placeholder}
      />
      {addressErrors[key] && <p style={{ ...s.fieldError, marginTop: -4 }}>{addressErrors[key]}</p>}
    </div>
  );

  return (
    <div>
      <StepDots step={step} total={3} />

      {step === 1 && (
        <div style={s.stepCard}>
          <p style={s.stepLabel}>Step 1 of 3</p>
          <h2 style={s.stepTitle}>Contact email</h2>
          <p style={s.stepDesc}>We'll send your order confirmation here.</p>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(''); }}
            style={{ ...s.input, ...(emailError ? s.inputError : {}) }}
            autoComplete="email"
          />
          {emailError && <p style={s.fieldError}>{emailError}</p>}
          <button
            onClick={() => {
              if (!validateEmail(email)) { setEmailError('Please enter a valid email address.'); return; }
              setEmailError('');
              setStep(2);
            }}
            style={s.btn}
          >
            Continue →
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={s.stepCard}>
          <p style={s.stepLabel}>Step 2 of 3</p>
          <h2 style={s.stepTitle}>Shipping address</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {field('firstName', 'First name', 'given-name', true)}
            {field('lastName', 'Last name', 'family-name', true)}
            {field('addressLine1', 'Address', 'address-line1')}
            {field('addressLine2', 'Apt, suite, etc. (optional)', 'address-line2')}
            {field('city', 'City', 'address-level2', true)}
            {field('province', 'Province / State', 'address-level1', true)}
            {field('postalCode', 'Postal code', 'postal-code', true)}
          </div>
          <button
            onClick={() => { if (validateAddress()) setStep(3); }}
            style={{ ...s.btn, marginTop: 8 }}
          >
            Continue →
          </button>
          <button onClick={() => setStep(1)} style={s.backBtn}>← Change email</button>
        </div>
      )}

      {step === 3 && (
        <div style={s.stepCard}>
          <p style={s.stepLabel}>Step 3 of 3</p>
          <h2 style={s.stepTitle}>Payment</h2>
          <div style={s.summaryRow}>
            <span style={s.summaryLabel}>{coverLabel} Memory Book</span>
            <span style={s.summaryPrice}>{priceStr} USD</span>
          </div>
          <div style={s.summaryRow}><span style={s.summaryLabel}>Shipping</span><span style={s.summaryPrice}>Included</span></div>
          <div style={s.summaryRow}><span style={s.summaryLabel}>Ships to</span><span style={s.summaryPrice}>{address.city}, {address.province}</span></div>
          <div style={s.cardBox}>
            <CardElement options={CARD_STYLE} onChange={e => setCardComplete(e.complete)} />
          </div>
          {error && <p style={s.fieldError}>{error}</p>}
          <button
            onClick={handlePay}
            disabled={!cardComplete || processing}
            style={{ ...s.btn, ...(!cardComplete || processing ? s.btnDisabled : {}) }}
          >
            {processing ? 'Placing order…' : `Pay ${priceStr} & Order Book`}
          </button>
          <button onClick={() => setStep(2)} style={s.backBtn}>← Change address</button>
        </div>
      )}
    </div>
  );
}

// ── Success Card ───────────────────────────────────────────────────────────────
function SuccessCard({ email, type }: { email: string; type: OrderType }) {
  return (
    <div style={s.successCard}>
      <div style={s.successIcon}>🕊️</div>
      {type === 'pdf' ? (
        <>
          <h2 style={s.successTitle}>Your Memory Book is on its way</h2>
          <p style={s.successText}>
            We've emailed your print-ready PDF to <strong>{email}</strong>.
            Check your inbox — it may take a minute or two to arrive.
          </p>
          <p style={s.successHint}>Recommended: Letter (8.5" × 11") · Full colour · Photo paper</p>
        </>
      ) : (
        <>
          <h2 style={s.successTitle}>Order placed!</h2>
          <p style={s.successText}>
            Your memory book is being printed and will ship to your address shortly.
            A confirmation will be sent to <strong>{email}</strong>.
          </p>
          <p style={s.successHint}>Estimated delivery: 5–10 business days</p>
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function BookOrderPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  // New app sends ?coverType=pdf|softcover|hardcover
  // Legacy app sends ?type=pdf|print
  searchParams: { type?: string; coverType?: string };
}) {
  const { eventId } = params;
  const [tributeName, setTributeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Resolve order type + cover type from URL — support both old and new param shapes
  const rawCoverType = searchParams.coverType; // 'pdf' | 'softcover' | 'hardcover' | undefined
  const legacyType   = searchParams.type;       // 'pdf' | 'print' | undefined

  let initialType: OrderType | null = null;
  let initialCoverType: CoverType = 'softcover';

  if (rawCoverType === 'pdf' || legacyType === 'pdf') {
    initialType = 'pdf';
  } else if (rawCoverType === 'softcover') {
    initialType = 'print';
    initialCoverType = 'softcover';
  } else if (rawCoverType === 'hardcover') {
    initialType = 'print';
    initialCoverType = 'hardcover';
  } else if (legacyType === 'print') {
    initialType = 'print';
  }

  const [orderType, setOrderType] = useState<OrderType | null>(initialType);
  const [coverType, setCoverType] = useState<CoverType>(initialCoverType);
  const [priceCents, setPriceCents] = useState<number>(
    initialCoverType === 'hardcover' ? 5999 : 4399,
  );

  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'tributes', eventId));
        if (!snap.exists()) { setNotFound(true); return; }
        const data = snap.data();
        setTributeName(data.deceasedName || data.lovedOneName || 'Your Loved One');
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  // When the app deep-links with a pre-selected cover type, auto-fetch pricing
  // so the price shown to the user is accurate (not the fallback placeholder).
  useEffect(() => {
    if (initialType !== 'print' || !rawCoverType) return;
    (async () => {
      try {
        const res  = await fetch(`/api/get-book-price?eventId=${eventId}`);
        const data = await res.json() as PricingData;
        if (data.softcover || data.hardcover) {
          setPricingData(data);
          const p = initialCoverType === 'hardcover' ? data.hardcover : data.softcover;
          if (p) setPriceCents(p);
        }
      } catch { /* non-fatal — fallback price is shown, confirmed server-side at payment */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPricing = async () => {
    // Toggle if already loaded
    if (pricingData && !pricingError) { setPricingOpen(o => !o); return; }
    setPricingOpen(true);
    setPricingLoading(true);
    setPricingError(false);
    try {
      const res = await fetch(`/api/get-book-price?eventId=${eventId}`);
      const data = await res.json();
      if (data.softcover && data.hardcover) {
        setPricingData(data as PricingData);
      } else {
        setPricingError(true);
      }
    } catch {
      setPricingError(true);
    } finally {
      setPricingLoading(false);
    }
  };

  const handleSelectCoverType = (ct: CoverType) => {
    setCoverType(ct);
    setPriceCents(pricingData ? (pricingData[ct] ?? (ct === 'hardcover' ? 5999 : 4399)) : ct === 'hardcover' ? 5999 : 4399);
    setOrderType('print');
  };

  if (loading) {
    return <div style={s.page}><div style={s.container}><p style={{ color: '#aaa', textAlign: 'center' }}>Loading…</p></div></div>;
  }
  if (notFound) {
    return <div style={s.page}><div style={s.container}><p style={{ color: '#aaa', textAlign: 'center' }}>Tribute not found.</p></div></div>;
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerGold} />
          <p style={s.headerTagline}>Memory Book</p>
          <h1 style={s.headerName}>{tributeName}</h1>
        </div>

        {/* ── Format selector ── */}
        {!orderType && (
          <>
            <p style={{ textAlign: 'center', color: '#888', fontSize: 14, marginBottom: 20 }}>
              Choose your format
            </p>

            {/* PDF card */}
            <div style={{ ...s.optionCard, cursor: 'pointer' }} onClick={() => setOrderType('pdf')}>
              <div style={s.optionTop}>
                <span style={s.optionEmoji}>📄</span>
                <div style={{ flex: 1 }}>
                  <p style={s.optionTitle}>Print-It-Yourself PDF</p>
                  <p style={s.optionDesc}>Emailed to you instantly. Print at home or any print shop.</p>
                </div>
                <span style={s.optionPrice}>$4.99</span>
              </div>
            </div>

            {/* Print + ship card */}
            <div style={{ ...s.optionCard, cursor: 'default' }}>
              <div style={s.optionTop}>
                <span style={s.optionEmoji}>📦</span>
                <div style={{ flex: 1 }}>
                  <p style={s.optionTitle}>We Create &amp; Ship to You</p>
                  <p style={s.optionDesc}>
                    We print a beautiful book and ship it directly to your door.
                  </p>
                </div>
                <button onClick={fetchPricing} style={s.seePricingBtn}>
                  {pricingOpen ? 'Hide ↑' : 'See pricing →'}
                </button>
              </div>

              {/* ── Pricing expansion ── */}
              {pricingOpen && (
                <div style={s.pricingPanel}>
                  {pricingLoading && (
                    <p style={{ textAlign: 'center', color: '#aaa', fontSize: 14, margin: 0 }}>
                      Calculating prices…
                    </p>
                  )}

                  {!pricingLoading && pricingError && (
                    <p style={{ textAlign: 'center', color: '#e05252', fontSize: 13, margin: 0 }}>
                      Could not load pricing.{' '}
                      <button
                        onClick={fetchPricing}
                        style={{ color: '#c9a96e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}
                      >
                        Try again
                      </button>
                    </p>
                  )}

                  {!pricingLoading && pricingData && (
                    <>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {/* Soft Cover — only shown when available for this size/orientation */}
                        {pricingData.softcoverAvailable && pricingData.softcover != null && (
                          <div style={s.coverCard} onClick={() => handleSelectCoverType('softcover')}>
                            <p style={s.coverEmoji}>📖</p>
                            <p style={s.coverTitle}>Soft Cover</p>
                            <p style={s.coverPrice}>{formatPrice(pricingData.softcover)}</p>
                            <p style={s.coverNote}>USD · incl. shipping</p>
                            <p style={s.coverCta}>Select →</p>
                          </div>
                        )}

                        {/* Hard Cover — always available */}
                        <div style={s.coverCard} onClick={() => handleSelectCoverType('hardcover')}>
                          <p style={s.coverEmoji}>📚</p>
                          <p style={s.coverTitle}>Hard Cover</p>
                          <p style={s.coverPrice}>{formatPrice(pricingData.hardcover)}</p>
                          <p style={s.coverNote}>USD · incl. shipping</p>
                          <p style={s.coverCta}>Select →</p>
                        </div>
                      </div>

                      {!pricingData.softcoverAvailable && (
                        <p style={{ fontSize: 11, color: '#aaa', marginTop: 10, marginBottom: 0, textAlign: 'center' }}>
                          Soft Cover is only available for 8×8" and 8×11" vertical books.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <p style={s.footer}>Secured by Stripe · Lumoriam</p>
          </>
        )}

        {/* ── Order forms ── */}
        {orderType && (
          <>
            <button onClick={() => setOrderType(null)} style={{ ...s.backBtn, marginBottom: 8 }}>
              ← Back
            </button>
            <Elements stripe={stripePromise}>
              {orderType === 'pdf'
                ? <PdfOrderForm eventId={eventId} tributeName={tributeName} />
                : <PrintOrderForm eventId={eventId} tributeName={tributeName} coverType={coverType} priceCents={priceCents} />
              }
            </Elements>
            <p style={s.footer}>Secured by Stripe · Lumoriam</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:               { minHeight: '100vh', backgroundColor: '#f8f6f2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'Georgia, serif' },
  container:          { width: '100%', maxWidth: 480 },
  header:             { textAlign: 'center', marginBottom: 24 },
  headerGold:         { width: 40, height: 2, backgroundColor: '#c9a96e', margin: '0 auto 14px' },
  headerTagline:      { fontSize: 11, letterSpacing: 4, textTransform: 'uppercase' as const, color: '#c9a96e', marginBottom: 8 },
  headerName:         { fontSize: 28, color: '#2c2c2c', margin: '0 0 8px', fontWeight: 'normal' },

  optionCard:         { backgroundColor: '#fff', borderRadius: 14, padding: '18px 16px', marginBottom: 12, border: '1px solid #e8e4dc' },
  optionTop:          { display: 'flex', alignItems: 'flex-start', gap: 12 },
  optionEmoji:        { fontSize: 28, lineHeight: '1' },
  optionTitle:        { fontSize: 15, fontWeight: 'bold', color: '#2c2c2c', margin: '0 0 4px' },
  optionDesc:         { fontSize: 12, color: '#777', margin: 0, lineHeight: '1.5' },
  optionPrice:        { fontSize: 16, fontWeight: 'bold', color: '#2c2c2c', whiteSpace: 'nowrap' as const },
  seePricingBtn:      { background: 'none', border: 'none', color: '#c9a96e', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap' as const, padding: '2px 0' },

  pricingPanel:       { marginTop: 16, borderTop: '1px solid #e8e4dc', paddingTop: 16 },
  coverCard:          { flex: 1, backgroundColor: '#fafaf8', border: '1px solid #e8e4dc', borderRadius: 10, padding: '14px 12px', cursor: 'pointer', textAlign: 'center' as const },
  coverEmoji:         { fontSize: 22, margin: '0 0 6px' },
  coverTitle:         { fontSize: 13, fontWeight: 'bold', color: '#2c2c2c', margin: '0 0 6px' },
  coverPrice:         { fontSize: 18, fontWeight: 'bold', color: '#c9a96e', margin: '0 0 2px' },
  coverNote:          { fontSize: 10, color: '#aaa', margin: '0 0 10px', letterSpacing: 0.5 },
  coverCta:           { fontSize: 12, color: '#c9a96e', margin: 0, fontWeight: 'bold' },

  stepCard:           { backgroundColor: '#fff', borderRadius: 14, padding: '24px 20px', border: '1px solid #e8e4dc', marginBottom: 12 },
  stepLabel:          { fontSize: 11, color: '#c9a96e', letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 },
  stepTitle:          { fontSize: 20, color: '#2c2c2c', margin: '0 0 8px', fontWeight: 'normal' },
  stepDesc:           { fontSize: 13, color: '#777', lineHeight: '1.6', marginBottom: 20 },
  input:              { width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #d8d4cc', borderRadius: 10, backgroundColor: '#fafaf8', color: '#2c2c2c', outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const, fontFamily: 'Georgia, serif' },
  inputError:         { borderColor: '#e05252' },
  fieldError:         { fontSize: 12, color: '#e05252', marginBottom: 12 },
  cardBox:            { border: '1px solid #d8d4cc', borderRadius: 10, padding: '14px', backgroundColor: '#fafaf8', marginBottom: 16, marginTop: 16 },
  summaryRow:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel:       { fontSize: 13, color: '#777' },
  summaryPrice:       { fontSize: 13, color: '#2c2c2c', fontWeight: 'bold' },
  btn:                { width: '100%', padding: '14px', backgroundColor: '#c9a96e', color: '#1a1200', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 'bold', cursor: 'pointer', letterSpacing: 0.5, marginTop: 4, fontFamily: 'Georgia, serif' },
  btnDisabled:        { backgroundColor: '#e0ddd8', color: '#aaa', cursor: 'not-allowed' },
  backBtn:            { width: '100%', padding: '10px', backgroundColor: 'transparent', color: '#888', border: 'none', fontSize: 13, cursor: 'pointer', marginTop: 8, fontFamily: 'Georgia, serif' },
  successCard:        { backgroundColor: '#fff', borderRadius: 14, padding: '32px 24px', textAlign: 'center' as const, border: '1px solid #e8e4dc' },
  successIcon:        { fontSize: 48, marginBottom: 16 },
  successTitle:       { fontSize: 22, color: '#2c2c2c', fontWeight: 'normal', margin: '0 0 12px' },
  successText:        { fontSize: 14, color: '#555', lineHeight: '1.6', marginBottom: 16 },
  successHint:        { fontSize: 12, color: '#aaa', lineHeight: '1.5' },
  footer:             { textAlign: 'center' as const, fontSize: 11, color: '#bbb', letterSpacing: 1, marginTop: 16 },
};
