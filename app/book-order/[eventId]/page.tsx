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

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDots({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '16px 0 24px' }}>
      {[1, 2, 3].map(s => (
        <div
          key={s}
          style={{
            width: s === step ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: s === step ? '#c9a96e' : '#e0ddd8',
            transition: 'all 0.3s',
          }}
        />
      ))}
    </div>
  );
}

// ── Inner form (needs Stripe context) ─────────────────────────────────────────
function BookOrderForm({ eventId, tributeName }: { eventId: string; tributeName: string }) {
  const stripe = useStripe();
  const elements = useElements();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleEmailNext = () => {
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError('');
    setStep(2);
  };

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError('');

    try {
      // 1. Create PaymentIntent
      const intentRes = await fetch('/api/create-book-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, email, tributeName }),
      });
      const { clientSecret, error: intentError } = await intentRes.json();
      if (intentError) throw new Error(intentError);

      // 2. Confirm card payment
      const cardElement = elements.getElement(CardElement);
      const { paymentIntent, error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement! },
      });
      if (stripeError) throw new Error(stripeError.message);
      if (paymentIntent?.status !== 'succeeded') throw new Error('Payment did not complete.');

      // 3. Trigger PDF generation + email
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

  if (done) {
    return (
      <div style={s.successCard}>
        <div style={s.successIcon}>🕊️</div>
        <h2 style={s.successTitle}>Your Memory Book is on its way</h2>
        <p style={s.successText}>
          We've emailed your print-ready PDF to <strong>{email}</strong>.
          Check your inbox — it may take a minute or two to arrive.
        </p>
        <p style={s.successHint}>
          Recommended: Print on letter (8.5" × 11") or A4 · Full colour · Photo paper
        </p>
      </div>
    );
  }

  return (
    <div>
      <StepDots step={step} />

      {/* Step 1 — Email */}
      {step === 1 && (
        <div style={s.stepCard}>
          <p style={s.stepLabel}>Step 1 of 3</p>
          <h2 style={s.stepTitle}>Where should we send your PDF?</h2>
          <p style={s.stepDesc}>
            Your memory book will be emailed to you as a print-ready PDF.
          </p>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleEmailNext()}
            style={{ ...s.input, ...(emailError ? s.inputError : {}) }}
            autoComplete="email"
          />
          {emailError && <p style={s.fieldError}>{emailError}</p>}
          <button onClick={handleEmailNext} style={s.btn}>
            Continue →
          </button>
        </div>
      )}

      {/* Step 2 — Payment */}
      {step === 2 && (
        <div style={s.stepCard}>
          <p style={s.stepLabel}>Step 2 of 3</p>
          <h2 style={s.stepTitle}>Payment</h2>
          <div style={s.summaryRow}>
            <span style={s.summaryLabel}>Print-It-Yourself PDF</span>
            <span style={s.summaryPrice}>$5.99 CAD</span>
          </div>
          <div style={s.summaryRow}>
            <span style={s.summaryLabel}>Delivery</span>
            <span style={s.summaryPrice}>Email</span>
          </div>
          <div style={s.cardBox}>
            <CardElement
              options={CARD_STYLE}
              onChange={e => setCardComplete(e.complete)}
            />
          </div>
          {error && <p style={s.fieldError}>{error}</p>}
          <button
            onClick={handlePay}
            disabled={!cardComplete || processing}
            style={{ ...s.btn, ...(!cardComplete || processing ? s.btnDisabled : {}) }}
          >
            {processing ? 'Processing…' : 'Pay $5.99 & Get PDF'}
          </button>
          <button onClick={() => setStep(1)} style={s.backBtn}>
            ← Change email
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function BookOrderPage({ params }: { params: { eventId: string } }) {
  const { eventId } = params;
  const [tributeName, setTributeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <p style={{ color: '#aaa', textAlign: 'center' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <p style={{ color: '#aaa', textAlign: 'center' }}>Tribute not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerGold} />
          <p style={s.headerTagline}>Memory Book</p>
          <h1 style={s.headerName}>{tributeName}</h1>
          <p style={s.headerSub}>Print-It-Yourself · $5.99 CAD</p>
        </div>

        {/* What you get */}
        <div style={s.featureList}>
          {[
            '📖  Professionally laid-out PDF with cover + photo pages',
            '✉️  Delivered to your inbox within minutes',
            '🖨️  Print at home or at any local print shop',
            '📐  Formatted for 8.5" × 11" letter paper',
          ].map(f => (
            <p key={f} style={s.feature}>{f}</p>
          ))}
        </div>

        {/* Form */}
        <Elements stripe={stripePromise}>
          <BookOrderForm eventId={eventId} tributeName={tributeName} />
        </Elements>

        <p style={s.footer}>Secured by Stripe · Memoriam</p>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8f6f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: 'Georgia, serif',
  },
  container: {
    width: '100%',
    maxWidth: 480,
  },
  header: {
    textAlign: 'center',
    marginBottom: 24,
  },
  headerGold: {
    width: 40,
    height: 2,
    backgroundColor: '#c9a96e',
    margin: '0 auto 14px',
  },
  headerTagline: {
    fontSize: 11,
    letterSpacing: 4,
    textTransform: 'uppercase' as const,
    color: '#c9a96e',
    marginBottom: 8,
  },
  headerName: {
    fontSize: 28,
    color: '#2c2c2c',
    margin: '0 0 8px',
    fontWeight: 'normal',
  },
  headerSub: {
    fontSize: 14,
    color: '#888',
    letterSpacing: 1,
  },
  featureList: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: '16px 20px',
    marginBottom: 20,
    border: '1px solid #e8e4dc',
  },
  feature: {
    fontSize: 13,
    color: '#555',
    margin: '6px 0',
    lineHeight: '1.5',
  },
  stepCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: '24px 20px',
    border: '1px solid #e8e4dc',
    marginBottom: 12,
  },
  stepLabel: {
    fontSize: 11,
    color: '#c9a96e',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 20,
    color: '#2c2c2c',
    margin: '0 0 8px',
    fontWeight: 'normal',
  },
  stepDesc: {
    fontSize: 13,
    color: '#777',
    lineHeight: '1.6',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    padding: '13px 14px',
    fontSize: 15,
    border: '1px solid #d8d4cc',
    borderRadius: 10,
    backgroundColor: '#fafaf8',
    color: '#2c2c2c',
    outline: 'none',
    marginBottom: 8,
    boxSizing: 'border-box' as const,
    fontFamily: 'Georgia, serif',
  },
  inputError: {
    borderColor: '#e05252',
  },
  fieldError: {
    fontSize: 12,
    color: '#e05252',
    marginBottom: 12,
  },
  cardBox: {
    border: '1px solid #d8d4cc',
    borderRadius: 10,
    padding: '14px',
    backgroundColor: '#fafaf8',
    marginBottom: 16,
    marginTop: 16,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#777',
  },
  summaryPrice: {
    fontSize: 13,
    color: '#2c2c2c',
    fontWeight: 'bold',
  },
  btn: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#c9a96e',
    color: '#1a1200',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: 0.5,
    marginTop: 4,
    fontFamily: 'Georgia, serif',
  },
  btnDisabled: {
    backgroundColor: '#e0ddd8',
    color: '#aaa',
    cursor: 'not-allowed',
  },
  backBtn: {
    width: '100%',
    padding: '10px',
    backgroundColor: 'transparent',
    color: '#888',
    border: 'none',
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 8,
    fontFamily: 'Georgia, serif',
  },
  successCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: '32px 24px',
    textAlign: 'center',
    border: '1px solid #e8e4dc',
  },
  successIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    color: '#2c2c2c',
    fontWeight: 'normal',
    margin: '0 0 12px',
  },
  successText: {
    fontSize: 14,
    color: '#555',
    lineHeight: '1.6',
    marginBottom: 16,
  },
  successHint: {
    fontSize: 12,
    color: '#aaa',
    lineHeight: '1.5',
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#bbb',
    letterSpacing: 1,
    marginTop: 16,
  },
};
