import { useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, RotateCcw, Save,
  Loader2, AlertCircle, CheckCircle2
} from 'lucide-react';
import api from '../api/client';

const blank = {
  customer_name: '',
  customer_id: null,
  status: '',
  candidates: [],
  amount: '',
  type: ''
};

const amountWords = {
  'એક': 1, 'બે': 2, 'ત્રણ': 3, 'ચાર': 4,
  'પાંચ': 5, 'છ': 6, 'સાત': 7, 'આઠ': 8,
  'નવ': 9, 'દસ': 10, 'અગિયાર': 11,
  'બાર': 12, 'તેર': 13, 'ચૌદ': 14,
  'પંદર': 15, 'સોળ': 16, 'સત્તર': 17,
  'અઢાર': 18, 'ઓગણીસ': 19,
  'વીસ': 20, 'ત્રીસ': 30, 'ચાલીસ': 40,
  'પચાસ': 50, 'સાઠ': 60, 'સિત્તેર': 70,
  'એંસી': 80, 'નેવું': 90,
  'સો': 100, 'હજાર': 1000, 'લાખ': 100000,
  zero: 0, one: 1, two: 2, three: 3,
  four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
  lakh: 100000
};

function amountFromSpeech(value) {
  const text = String(value).toLowerCase()
    .replace(/[૦૧૨૩૪૫૬૭૮૯]/g, digit =>
      String('૦૧૨૩૪૫૬૭૮૯'.indexOf(digit))
    )
    .replace(/,/g, '')
    .trim();

  const numeric = text.match(/\d+(?:\.\d{1,2})?/);

  if (numeric) {
    const number = Number(numeric[0]);
    return number > 0 ? number.toFixed(2) : '';
  }

  let total = 0;
  let current = 0;
  let found = false;

  for (const word of text.split(/[\s-]+/)) {
    if (!Object.prototype.hasOwnProperty.call(amountWords, word)) {
      continue;
    }

    found = true;
    const number = amountWords[word];

    if (number === 100) {
      current = (current || 1) * 100;
    } else if (number >= 1000) {
      total += (current || 1) * number;
      current = 0;
    } else {
      current += number;
    }
  }

  const amount = total + current;

  return found && amount > 0
    ? amount.toFixed(2)
    : '';
}

function typeFromSpeech(value) {
  const text = String(value).toLowerCase();

  const debit = [
    'બાકી', 'ઉધાર', 'લેવાના',
    'due', 'debit', 'pending', 'gave'
  ];

  const credit = [
    'આવી ગયા', 'આવ્યા', 'આવી ગયા છે',
    'જમા', 'મળ્યા', 'મળી ગયા',
    'ચૂકવ્યા', 'received', 'receive',
    'credit', 'paid', 'payment'
  ];

  const isDebit = debit.some(word => text.includes(word));
  const isCredit = credit.some(word => text.includes(word));

  if (isDebit === isCredit) return '';
  return isDebit ? 'debit' : 'credit';
}

function apiError(error) {
  const errors = error.response?.data?.errors;

  if (errors) {
    const first = Object.values(errors).flat()[0];
    if (first) return String(first);
  }

  return error.response?.data?.message ||
    error.message || 'Something went wrong.';
}

function displayName(customer, gu) {
  return gu
    ? customer.name_gu || customer.name_en
    : customer.name_en || customer.name_gu;
}

export default function VoiceEntryPage({ language = 'gu' }) {
  const gu = language === 'gu';
  const microphone = useRef(null);
  const requestNumber = useRef(0);
  const savingRef = useRef(false);

  const [voiceLanguage, setVoiceLanguage] = useState(
    gu ? 'gu-IN' : 'en-IN'
  );

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ...blank });
  const [spokenText, setSpokenText] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [requestKey, setRequestKey] = useState(
    () => crypto.randomUUID()
  );

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  useEffect(() => {
    setVoiceLanguage(gu ? 'gu-IN' : 'en-IN');
  }, [gu]);

  useEffect(() => {
    return () => {
      requestNumber.current += 1;
      microphone.current?.abort();
    };
  }, []);

  const labels = gu
    ? [
        'ગ્રાહકનું નામ બોલો',
        'રકમ બોલો',
        'બાકી કે આવી ગયા બોલો'
      ]
    : [
        'Speak customer name',
        'Speak amount',
        'Say Due or Received'
      ];

  async function processSpeech(value) {
    const text = String(value || '').trim();

    if (!text) {
      setError(gu ? 'કંઈક બોલો અથવા લખો.' : 'Please speak or type.');
      return;
    }

    setError('');
    setSuccess('');

    if (step === 1) {
      const currentRequest = ++requestNumber.current;
      setLoading(true);

      try {
        const response = await api.post(
          '/api/v1/voice/customer-match',
          { name: text }
        );

        if (currentRequest !== requestNumber.current) return;

        const result = response.data;

        setForm(previous => ({
          ...previous,
          customer_name: text,
          customer_id: result.customer?.id || null,
          status: result.status,
          candidates: result.matches || [],
          amount: '',
          type: ''
        }));

        if (result.status === 'existing' ||
            result.status === 'new') {
          setStep(2);
          setSpokenText('');
        }
      } catch (err) {
        setError(apiError(err));
      } finally {
        if (currentRequest === requestNumber.current) {
          setLoading(false);
        }
      }

      return;
    }

    if (step === 2) {
      const amount = amountFromSpeech(text);

      if (!amount) {
        setError(gu
          ? 'રકમ ઓળખાઈ નથી. ફરી બોલો અથવા 5000 લખો.'
          : 'Amount not recognized. Try again.');
        return;
      }

      setForm(previous => ({ ...previous, amount }));
      setStep(3);
      setSpokenText('');
      return;
    }

    if (step === 3) {
      const type = typeFromSpeech(text);

      if (!type) {
        setError(gu
          ? 'બાકી અથવા આવી ગયા સ્પષ્ટ બોલો.'
          : 'Say Due or Received clearly.');
        return;
      }

      setForm(previous => ({ ...previous, type }));
      setStep(4);
      setSpokenText('');
    }
  }

  function startMicrophone() {
    if (!SpeechRecognition || listening || loading || saving) return;

    const recognition = new SpeechRecognition();
    microphone.current = recognition;

    recognition.lang = voiceLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = event => {
      const text = event.results[0][0].transcript.trim();
      setSpokenText(text);
      void processSpeech(text);
    };

    recognition.onerror = event => {
      if (event.error !== 'aborted') {
        setError('Microphone error: ' + event.error);
      }
    };

    recognition.onend = () => {
      setListening(false);
      microphone.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      setError(apiError(err));
      setListening(false);
    }
  }

  function resetForm() {
    microphone.current?.abort();
    requestNumber.current += 1;

    setStep(1);
    setForm({ ...blank });
    setSpokenText('');
    setListening(false);
    setLoading(false);
    setConfirm(false);
    setError('');
    setRequestKey(crypto.randomUUID());
  }

  function chooseCustomer(customer) {
    setForm(previous => ({
      ...previous,
      customer_id: customer.id,
      status: 'existing',
      candidates: []
    }));

    setStep(2);
    setSpokenText('');
    setError('');
  }

  function chooseNewCustomer() {
    setForm(previous => ({
      ...previous,
      customer_id: null,
      status: 'new',
      candidates: []
    }));

    setStep(2);
    setSpokenText('');
    setError('');
  }

  async function saveEntry() {
    if (savingRef.current || step !== 4) return;

    savingRef.current = true;
    setSaving(true);
    setError('');

    try {
      const response = await api.post('/api/v1/voice/save', {
        customer_id: form.customer_id,
        customer_name: form.customer_name,
        language: voiceLanguage,
        amount: form.amount,
        type: form.type,
        idempotency_key: requestKey
      });

      resetForm();

      setSuccess(
        response.data?.replayed
          ? (gu
              ? 'આ એન્ટ્રી પહેલેથી સેવ થયેલી છે.'
              : 'This entry was already saved.')
          : (gu
              ? 'એન્ટ્રી સફળતાપૂર્વક સેવ થઈ.'
              : 'Transaction saved successfully.')
      );
    } catch (err) {
      setError(apiError(err));
      setConfirm(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-300 px-4 py-3 ' +
    'bg-white text-slate-900 outline-none ' +
    'focus:ring-2 focus:ring-blue-200';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {gu ? 'વોઇસ એન્ટ્રી' : 'Voice Entry'}
        </h1>

        <p className="text-slate-500 mt-1">
          {gu
            ? 'ત્રણ વાર બોલીને ગ્રાહકની એન્ટ્રી બનાવો.'
            : 'Create a transaction in three voice steps.'}
        </p>
      </div>

      {success && (
        <div role="status"
          className="flex gap-2 rounded-xl bg-green-50 p-4 text-green-700">
          <CheckCircle2 size={20} />
          {success}
        </div>
      )}

      {error && (
        <div role="alert"
          className="flex gap-2 rounded-xl bg-red-50 p-4 text-red-700">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-6 space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {labels.map((label, index) => (
            <div key={index}
              className={
                'rounded-xl border p-3 text-center text-sm ' +
                (step === index + 1
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : step > index + 1
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500')
              }>
              <div className="font-bold text-lg">{index + 1}</div>
              {label}
            </div>
          ))}
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'વોઇસ ભાષા' : 'Voice Language'}
          </label>
          <select
            value={voiceLanguage}
            disabled={listening || loading || saving}
            onChange={event => setVoiceLanguage(event.target.value)}
            className={inputClass}
          >
            <option value="gu-IN">ગુજરાતી</option>
            <option value="en-IN">English (India)</option>
          </select>
        </div>

        {step <= 3 && (
          <div className="text-center py-5">
            <h2 className="text-lg font-semibold mb-4">
              {labels[step - 1]}
            </h2>

            <button
              type="button"
              onClick={
                listening
                  ? () => microphone.current?.stop()
                  : startMicrophone
              }
              disabled={!SpeechRecognition || loading || saving}
              className={
                'w-24 h-24 rounded-full text-white ' +
                'inline-flex items-center justify-center shadow-lg ' +
                (listening
                  ? 'bg-red-600 animate-pulse'
                  : 'bg-blue-600 hover:bg-blue-700') +
                ' disabled:opacity-40'
              }
            >
              {listening
                ? <MicOff size={36} />
                : <Mic size={36} />}
            </button>

            <p className="mt-4 text-slate-600">
              {loading
                ? (gu ? 'શોધી રહ્યા છીએ...' : 'Searching...')
                : listening
                  ? (gu ? 'સાંભળી રહ્યું છે...' : 'Listening...')
                  : (gu ? 'માઇક દબાવીને બોલો' : 'Tap to speak')}
            </p>

            {!SpeechRecognition && (
              <p className="text-red-600 mt-2 text-sm">
                Speech recognition is not available in this browser.
              </p>
            )}
          </div>
        )}

        {step === 1 && form.candidates.length > 0 && (
          <div className="rounded-xl bg-amber-50 p-4 space-y-3">
            <h3 className="font-semibold">
              {gu
                ? 'મળતા આવતા ગ્રાહકોમાંથી પસંદ કરો'
                : 'Select a matching customer'}
            </h3>

            {form.candidates.map(customer => (
              <button
                key={customer.id}
                type="button"
                onClick={() => chooseCustomer(customer)}
                className="block w-full rounded-xl border bg-white p-3 text-left"
              >
                {displayName(customer, gu)}
                {customer.phone ? ' - ' + customer.phone : ''}
              </button>
            ))}

            <button
              type="button"
              onClick={chooseNewCustomer}
              className="w-full rounded-xl border border-blue-300 bg-blue-50 p-3 font-medium text-blue-700"
            >
              {gu
                ? 'આમાંથી કોઈ નથી — નવો ગ્રાહક'
                : 'None of these — New Customer'}
            </button>
          </div>
        )}

        {step <= 3 && (
          <div className="space-y-3">
            <label className="block font-medium">
              {gu ? 'બોલેલું લખાણ' : 'Recognized Text'}
            </label>

            <input
              type="text"
              value={spokenText}
              onChange={event => setSpokenText(event.target.value)}
              placeholder={
                step === 1
                  ? (gu ? 'રમેશભાઈ પટેલ' : 'Ramesh Patel')
                  : step === 2
                    ? (gu ? 'પાંચ હજાર / 5000' : 'Five thousand / 5000')
                    : (gu ? 'બાકી / આવી ગયા' : 'Due / Received')
              }
              className={inputClass}
            />

            <button
              type="button"
              disabled={loading || listening || saving}
              onClick={() => processSpeech(spokenText)}
              className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-50"
            >
              {loading
                ? <Loader2 className="animate-spin mx-auto" size={20} />
                : (gu ? 'આગળ વધો' : 'Continue')}
            </button>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 p-4 space-y-3">
          <h3 className="font-semibold">
            {gu ? 'એન્ટ્રીની વિગતો' : 'Transaction Preview'}
          </h3>

          <div className="flex justify-between gap-3">
            <span>{gu ? 'ગ્રાહક' : 'Customer'}</span>
            <span className="font-semibold text-right">
              {form.customer_name || '-'}
              {form.status === 'new' && (
                <span className="block text-xs text-blue-600">
                  {gu ? 'નવો ગ્રાહક' : 'New Customer'}
                </span>
              )}
              {form.status === 'existing' && (
                <span className="block text-xs text-green-600">
                  {gu ? 'હાલનો ગ્રાહક' : 'Existing Customer'}
                </span>
              )}
            </span>
          </div>

          <div className="flex justify-between">
            <span>{gu ? 'રકમ' : 'Amount'}</span>
            <strong>{form.amount ? '₹' + form.amount : '-'}</strong>
          </div>

          <div className="flex justify-between">
            <span>{gu ? 'પ્રકાર' : 'Type'}</span>
            <strong>
              {form.type === 'debit'
                ? (gu ? 'બાકી / ઉધાર' : 'Due / Debit')
                : form.type === 'credit'
                  ? (gu ? 'આવી ગયા / જમા' : 'Received / Credit')
                  : '-'}
            </strong>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {step > 1 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setStep(previous => previous - 1);
                setSpokenText('');
                setError('');
              }}
              className="rounded-xl border px-5 py-3"
            >
              {gu ? 'પાછળ' : 'Back'}
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => {
              resetForm();
              setSuccess('');
            }}
            className="flex items-center gap-2 rounded-xl border px-5 py-3"
          >
            <RotateCcw size={18} />
            {gu ? 'રીસેટ' : 'Reset'}
          </button>

          {step === 4 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirm(true)}
              className="flex-1 flex justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
            >
              <Save size={18} />
              {gu ? 'ચકાસીને સેવ કરો' : 'Review & Save'}
            </button>
          )}
        </div>
      </section>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4"
          >
            <h2 className="text-xl font-bold">
              {gu ? 'એન્ટ્રીની ખાતરી કરો' : 'Confirm Transaction'}
            </h2>

            <p>
              <strong>{gu ? 'ગ્રાહક:' : 'Customer:'}</strong>{' '}
              {form.customer_name}
            </p>

            <p>
              <strong>{gu ? 'રકમ:' : 'Amount:'}</strong>{' '}
              ₹{form.amount}
            </p>

            <p>
              <strong>{gu ? 'પ્રકાર:' : 'Type:'}</strong>{' '}
              {form.type === 'debit'
                ? (gu ? 'બાકી' : 'Due')
                : (gu ? 'આવી ગયા' : 'Received')}
            </p>

            {form.status === 'new' && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                {gu
                  ? 'નવો ગ્રાહક અને તેની એન્ટ્રી સાથે સેવ થશે.'
                  : 'A new customer and transaction will be saved.'}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl border py-3"
              >
                {gu ? 'પાછા' : 'Back'}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={saveEntry}
                className="flex-1 flex justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving && <Loader2 size={18} className="animate-spin" />}
                {gu ? 'સેવ કરો' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}