'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const CLOUDINARY_CLOUD_NAME = 'djkxympk0';
const CLOUDINARY_UPLOAD_PRESET = 'photo_slideshow';

export default function GuestPage() {
  const [eventId, setEventId] = useState('');
  const [screen, setScreen] = useState<'home' | 'upload' | 'condolences' | 'events'>('home');
  const [guestName, setGuestName] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [condolences, setCondolences] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tributeName, setTributeName] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('event') || '';
    setEventId(id);
  }, []);

  useEffect(() => {
    if (!eventId) return;

    const loadTribute = async () => {
      const snapshot = await getDocs(collection(db, 'users'));
      for (const userDoc of snapshot.docs) {
        const tributesSnap = await getDocs(collection(db, 'users', userDoc.id, 'tributes'));
        for (const tributeDoc of tributesSnap.docs) {
          if (tributeDoc.data().eventId === eventId) {
            setTributeName(tributeDoc.data().lovedOneName);
            const eventsSnap = await getDocs(
              collection(db, 'users', userDoc.id, 'tributes', tributeDoc.id, 'events')
            );
            const eventsList = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            eventsList.sort((a: any, b: any) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
            setEvents(eventsList);
          }
        }
      }
    };

    const unsubCondolences = onSnapshot(
      collection(db, 'condolences'),
      (snapshot) => {
        const list = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((c: any) => c.eventId === eventId)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCondolences(list);
      }
    );

    loadTribute();
    return () => { unsubCondolences(); };
  }, [eventId]);

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    const data = await response.json();
    if (!data.secure_url) throw new Error('Upload failed');
    return data.secure_url;
  };

  const handleUpload = async () => {
    if (!guestName.trim()) { setError('Please enter your name.'); return; }
    if (photos.length === 0) { setError('Please select at least one photo.'); return; }
    setUploading(true);
    setError('');
    try {
      for (const photo of photos) {
        const url = await uploadToCloudinary(photo);
        await addDoc(collection(db, 'photos'), {
          url,
          eventId,
          uploadedBy: guestName.trim(),
          message: message.trim(),
          uploadedAt: new Date().toISOString(),
          pending: true,
        });
      }
      if (message.trim()) {
        await addDoc(collection(db, 'condolences'), {
          eventId,
          name: guestName.trim(),
          message: message.trim(),
          createdAt: new Date().toISOString(),
        });
      }
      setSuccess(`Thank you ${guestName}! Your photos have been added to the tribute.`);
      setPhotos([]);
      setMessage('');
      setGuestName('');
      setScreen('home');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleCondolence = async () => {
    if (!guestName.trim()) { setError('Please enter your name.'); return; }
    if (!message.trim()) { setError('Please enter a message.'); return; }
    setUploading(true);
    setError('');
    try {
      await addDoc(collection(db, 'condolences'), {
        eventId,
        name: guestName.trim(),
        message: message.trim(),
        createdAt: new Date().toISOString(),
      });
      setSuccess('Your message has been shared.');
      setMessage('');
      setGuestName('');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }) + ' at ' + new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (!eventId) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.icon}>✦</div>
          <h1 style={styles.title}>Memoria</h1>
          <p style={styles.subtitle}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>✦</div>
        <h1 style={styles.title}>Memoria</h1>

        {tributeName && (
          <>
            <p style={styles.inMemory}>In Memory Of</p>
            <h2 style={styles.tributeName}>{tributeName}</h2>
            <div style={styles.divider} />
          </>
        )}

        {success && (
          <div style={styles.successBox}>
            <p style={styles.successText}>{success}</p>
          </div>
        )}

        {screen === 'home' && (
          <div style={styles.homeButtons}>
            <button style={styles.btnPrimary} onClick={() => { setScreen('upload'); setSuccess(''); setError(''); }}>
              📷 Add Photos
            </button>
            <button style={styles.btnSecondary} onClick={() => { setScreen('condolences'); setSuccess(''); setError(''); }}>
              💬 Leave a Message
            </button>
            <button style={styles.btnSecondary} onClick={() => { setScreen('events'); setSuccess(''); setError(''); }}>
              📅 View Events
            </button>
          </div>
        )}

        {screen === 'upload' && (
          <div style={styles.form}>
            <h3 style={styles.formTitle}>Add Photos to Tribute</h3>
            {error && <p style={styles.errorText}>{error}</p>}
            <label style={styles.inputLabel}>Your Name</label>
            <input
              style={styles.input}
              placeholder="Enter your name"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
            />
            <label style={styles.inputLabel}>Message (optional)</label>
            <textarea
              style={styles.textarea}
              placeholder="Share a memory or kind words..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
            />
            <label style={styles.inputLabel}>Select Photos</label>
            <input
              type="file"
              accept="image/*"
              multiple
              style={styles.fileInput}
              onChange={e => setPhotos(Array.from(e.target.files || []))}
            />
            {photos.length > 0 && (
              <p style={styles.photoCount}>{photos.length} photo(s) selected</p>
            )}
            <div style={styles.formBtns}>
              <button style={styles.btnSecondary} onClick={() => setScreen('home')}>Back</button>
              <button style={styles.btnPrimary} onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload Photos'}
              </button>
            </div>
          </div>
        )}

        {screen === 'condolences' && (
          <div style={styles.form}>
            <h3 style={styles.formTitle}>Condolence Wall</h3>
            {error && <p style={styles.errorText}>{error}</p>}
            <label style={styles.inputLabel}>Your Name</label>
            <input
              style={styles.input}
              placeholder="Enter your name"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
            />
            <label style={styles.inputLabel}>Your Message</label>
            <textarea
              style={styles.textarea}
              placeholder="Share a memory or words of comfort..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
            />
            <div style={styles.formBtns}>
              <button style={styles.btnSecondary} onClick={() => setScreen('home')}>Back</button>
              <button style={styles.btnPrimary} onClick={handleCondolence} disabled={uploading}>
                {uploading ? 'Sending...' : 'Share Message'}
              </button>
            </div>
            <div style={styles.condolencesList}>
              <h4 style={styles.condolencesTitle}>Messages of Comfort</h4>
              {condolences.length === 0 && (
                <p style={styles.emptyText}>No messages yet. Be the first to share.</p>
              )}
              {condolences.map((c: any) => (
                <div key={c.id} style={styles.condolenceCard}>
                  <p style={styles.condolenceName}>{c.name}</p>
                  <p style={styles.condolenceMessage}>{c.message}</p>
                  <p style={styles.condolenceDate}>
                    {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 'events' && (
          <div style={styles.form}>
            <h3 style={styles.formTitle}>Events & Schedule</h3>
            <button style={{ ...styles.btnSecondary, marginBottom: '20px' }} onClick={() => setScreen('home')}>Back</button>
            {events.length === 0 && (
              <p style={styles.emptyText}>No events have been added yet.</p>
            )}
            {events.map((event: any) => (
              <div key={event.id} style={styles.eventCard}>
                <p style={styles.eventName}>{event.name}</p>
                <p style={styles.eventDate}>{formatDate(event.dateTime)}</p>
                {event.location && <p style={styles.eventLocation}>📍 {event.location}</p>}
                {event.notes && <p style={styles.eventNotes}>{event.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: '100vh', backgroundColor: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Georgia, serif' },
  card: { backgroundColor: '#111', borderRadius: '20px', padding: '40px 28px', maxWidth: '480px', width: '100%', border: '1px solid #1e1e1e', textAlign: 'center' },
  icon: { color: '#c9a96e', fontSize: '32px', marginBottom: '16px' },
  title: { color: '#c9a96e', fontSize: '28px', letterSpacing: '6px', fontWeight: 300, marginBottom: '8px', textTransform: 'uppercase' },
  subtitle: { color: '#555', fontSize: '13px' },
  inMemory: { color: '#555', fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' },
  tributeName: { color: '#e8e0d0', fontSize: '26px', fontWeight: 300, letterSpacing: '2px', marginBottom: '8px' },
  divider: { width: '40px', height: '1px', backgroundColor: '#c9a96e', margin: '16px auto', opacity: 0.5 },
  homeButtons: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' },
  btnPrimary: { backgroundColor: '#c9a96e', color: '#0a0a0a', border: 'none', borderRadius: '12px', padding: '16px 24px', fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 600 },
  btnSecondary: { backgroundColor: 'transparent', color: '#555', border: '1px solid #222', borderRadius: '12px', padding: '14px 24px', fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer' },
  form: { textAlign: 'left', marginTop: '16px' },
  formTitle: { color: '#e8e0d0', fontSize: '20px', fontWeight: 300, marginBottom: '20px', textAlign: 'center' },
  inputLabel: { display: 'block', color: '#c9a96e', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' },
  input: { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #222', borderRadius: '10px', padding: '14px', color: '#e8e0d0', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' },
  textarea: { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #222', borderRadius: '10px', padding: '14px', color: '#e8e0d0', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box', resize: 'vertical' },
  fileInput: { width: '100%', color: '#c9a96e', marginBottom: '12px' },
  photoCount: { color: '#c9a96e', fontSize: '12px', marginBottom: '16px' },
  formBtns: { display: 'flex', gap: '10px', marginTop: '8px' },
  successBox: { backgroundColor: '#1a1506', border: '1px solid #c9a96e', borderRadius: '10px', padding: '14px', marginBottom: '20px' },
  successText: { color: '#c9a96e', fontSize: '13px', margin: 0 },
  errorText: { color: '#c05050', fontSize: '13px', marginBottom: '12px' },
  condolencesList: { marginTop: '32px' },
  condolencesTitle: { color: '#555', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' },
  condolenceCard: { backgroundColor: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '16px', marginBottom: '12px' },
  condolenceName: { color: '#c9a96e', fontSize: '13px', fontWeight: 600, marginBottom: '6px' },
  condolenceMessage: { color: '#ccc', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' },
  condolenceDate: { color: '#444', fontSize: '11px' },
  emptyText: { color: '#333', fontSize: '13px', textAlign: 'center', marginTop: '20px' },
  eventCard: { backgroundColor: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '16px', marginBottom: '12px' },
  eventName: { color: '#e8e0d0', fontSize: '17px', marginBottom: '6px' },
  eventDate: { color: '#c9a96e', fontSize: '13px', marginBottom: '6px' },
  eventLocation: { color: '#666', fontSize: '13px', marginBottom: '4px' },
  eventNotes: { color: '#555', fontSize: '12px', lineHeight: 1.5 },
};