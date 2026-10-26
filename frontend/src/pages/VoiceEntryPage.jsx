
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Search,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Volume2,
  Loader2,
} from 'lucide-react';
import api from '../api/client';

const emptyForm = {
  customer_id: '',
  type: '',
  amount: '',
  description_gu: '',
  description_en: '',
};

const newKey = () => crypto.randomUUID();

function getError(error) {
  const errors = error.response?.data?.errors;

  if (errors) {
    const first = Object.values(errors).flat()[0];
    if (first) return String(first);
  }

  return (
    error.response?.data?.message ||
    error.message ||
    'Something went wrong.'
  );
}

function normalizeAmount(value) {
  const text = String(value).trim();

  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [whole, decimal = ''] = text.split('.');

  const rupees = whole.replace(/^0+(?=\d)/, '');
  const paise = decimal.padEnd(2, '0');

  if (rupees === '0' && paise === '00') {
    return null;
  }

  return `${rupees}.${paise}`;
}

function customerLabel(customer, gu) {
  if (!customer) return '';

  const name = gu
    ? customer.name_gu || customer.name_en
    : customer.name_en || customer.name_gu;

  return customer.phone
    ? `${name} - ${customer.phone}`
    : name;
}

export default function VoiceEntryPage({ language = 'gu' }) {
  const gu = language === 'gu';

  const recognitionRef = useRef(null);
  const requestIdRef = useRef(0);
  const customersRef = useRef([]);

  const [speechLanguage, setSpeechLanguage] = useState(
    language === 'gu' ? 'gu-IN' : 'en-IN'
  );

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [transcript, setTranscript] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [requestKey, setRequestKey] = useState(newKey);

  const [customers, setCustomers] = useState([]);
  const [customerMatches, setCustomerMatches] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);

  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setRequestKey(newKey());
    setMessage('');
  };

  const loadCustomers = useCallback(async (search = '') => {
    setCustomerLoading(true);

    try {
      const response = await api.get('/api/v1/customers', {
        params: {
          search,
          per_page: 100,
        },
      });

      const payload = response.data?.data;
      const list = Array.isArray(payload)
        ? payload
        : payload?.data || [];

      setCustomers(list);
      customersRef.current = list;
    } catch (err) {
      setError(getError(err));
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(customerSearch);
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearch, loadCustomers]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    setSupported(Boolean(SpeechRecognition));

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }

      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setSpeechLanguage(
      language === 'gu' ? 'gu-IN' : 'en-IN'
    );
  }, [language]);

  const parseVoiceText = async (text) => {
    const cleanText = text.trim();

    if (cleanText.length < 2) {
      setError(
        gu
          ? 'ઓછામાં ઓછા 2 અક્ષર લખો અથવા બોલો.'
          : 'Enter or speak at least 2 characters.'
      );
      return;
    }

    const requestId = ++requestIdRef.current;

    setParsing(true);
    setError('');
    setMessage('');
    setWarnings([]);
    setCustomerMatches([]);

    try {
      const response = await api.post('/api/v1/voice/parse', {
        text: cleanText,
        language: speechLanguage,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      const result = response.data?.data;

      if (!result) {
        throw new Error('Invalid voice parsing response.');
      }

      const matches = result.customer_matches || [];

      setCustomerMatches(matches);

      setForm((previous) => ({
        ...previous,
        customer_id: result.customer
          ? String(result.customer.id)
          : '',
        type: result.type || '',
        amount: result.amount || '',
      }));

      setRequestKey(newKey());
      setWarnings(result.warnings || []);

      if (matches.length === 1 && result.customer) {
        const customer = result.customer;

        setCustomers((previous) => {
          if (previous.some((item) => item.id === customer.id)) {
            return previous;
          }

          return [customer, ...previous];
        });
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(getError(err));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setParsing(false);
      }
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        gu
          ? 'આ browser માં speech recognition ઉપલબ્ધ નથી.'
          : 'Speech recognition is not supported in this browser.'
      );
      return;
    }

    if (listening || parsing) return;

    setError('');
    setMessage('');

    const recognition = new SpeechRecognition();

    recognitionRef.current = recognition;
    recognition.lang = speechLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onresult = (event) => {
      const spokenText =
        event.results[0][0].transcript.trim();

      setTranscript(spokenText);
      parseVoiceText(spokenText);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(
          gu
            ? `વોઇસ ઓળખવામાં સમસ્યા: ${event.error}`
            : `Speech recognition error: ${event.error}`
        );
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      setListening(false);
      setError(getError(err));
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  const resetForm = () => {
    recognitionRef.current?.abort();
    requestIdRef.current += 1;

    setListening(false);
    setParsing(false);
    setTranscript('');
    setForm({ ...emptyForm });
    setCustomerMatches([]);
    setCustomerSearch('');
    setWarnings([]);
    setError('');
    setMessage('');
    setConfirmOpen(false);
    setRequestKey(newKey());
  };

  const validateForm = () => {
    if (!form.customer_id) {
      setError(
        gu ? 'ગ્રાહક પસંદ કરો.' : 'Select a customer.'
      );
      return false;
    }

    if (!['debit', 'credit'].includes(form.type)) {
      setError(
        gu
          ? 'ઉધાર અથવા જમા પસંદ કરો.'
          : 'Select debit or credit.'
      );
      return false;
    }

    if (!normalizeAmount(form.amount)) {
      setError(
        gu
          ? 'યોગ્ય રકમ દાખલ કરો.'
          : 'Enter a valid amount.'
      );
      return false;
    }

    return true;
  };

  const openConfirmation = (event) => {
    event.preventDefault();

    setError('');
    setMessage('');

    if (!validateForm()) return;

    setConfirmOpen(true);
  };

  const saveTransaction = async () => {
    if (saving) return;

    if (!validateForm()) {
      setConfirmOpen(false);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await api.post(
        '/api/v1/transactions',
        {
          customer_id: Number(form.customer_id),
          type: form.type,
          amount: normalizeAmount(form.amount),
          description_gu:
            form.description_gu.trim() || null,
          description_en:
            form.description_en.trim() || null,
          idempotency_key: requestKey,
        }
      );

      setConfirmOpen(false);

      setMessage(
        response.data?.replayed
          ? (
              gu
                ? 'આ એન્ટ્રી પહેલેથી સેવ થઈ ગઈ છે.'
                : 'This transaction was already saved.'
            )
          : (
              gu
                ? 'એન્ટ્રી સફળતાપૂર્વક સેવ થઈ.'
                : 'Transaction saved successfully.'
            )
      );

      setForm({ ...emptyForm });
      setTranscript('');
      setCustomerMatches([]);
      setCustomerSearch('');
      setWarnings([]);
      setRequestKey(newKey());
    } catch (err) {
      setConfirmOpen(false);
      setError(getError(err));
    } finally {
      setSaving(false);
    }
  };

  const allCustomers = [
    ...customerMatches,
    ...customers.filter(
      (customer) =>
        !customerMatches.some(
          (match) => match.id === customer.id
        )
    ),
  ];

  const selectedCustomer = allCustomers.find(
    (customer) =>
      String(customer.id) === String(form.customer_id)
  );

  const inputClass =
    'w-full rounded-xl border border-slate-300 px-4 py-3 ' +
    'outline-none focus:ring-2 focus:ring-blue-200';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {gu ? 'વોઇસ એન્ટ્રી' : 'Voice Entry'}
        </h1>

        <p className="text-slate-500 mt-1">
          {gu
            ? 'બોલીને અથવા લખીને ઉધાર / જમા એન્ટ્રી બનાવો.'
            : 'Create debit or credit entries using speech or text.'}
        </p>
      </div>

      {message && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700"
        >
          <CheckCircle2 size={20} />
          {message}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
        >
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Volume2 size={21} className="text-blue-600" />
          <h2 className="text-lg font-semibold">
            {gu ? 'વોઇસ ઓળખાણ' : 'Speech Recognition'}
          </h2>
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'ભાષા પસંદ કરો' : 'Select Language'}
          </label>

          <select
            value={speechLanguage}
            disabled={listening}
            onChange={(event) =>
              setSpeechLanguage(event.target.value)
            }
            className={inputClass}
          >
            <option value="gu-IN">ગુજરાતી</option>
            <option value="en-IN">English (India)</option>
          </select>
        </div>

        <div className="text-center py-4">
          <button
            type="button"
            disabled={!supported || parsing}
            onClick={
              listening ? stopListening : startListening
            }
            className={
              'w-24 h-24 mx-auto rounded-full flex items-center justify-center text-white shadow-lg ' +
              (listening
                ? 'bg-red-600 animate-pulse'
                : 'bg-blue-600 hover:bg-blue-700') +
              ' disabled:opacity-40'
            }
          >
            {listening ? (
              <MicOff size={36} />
            ) : (
              <Mic size={36} />
            )}
          </button>

          <p className="mt-4 font-medium">
            {listening
              ? (gu ? 'સાંભળી રહ્યું છે...' : 'Listening...')
              : parsing
                ? (gu ? 'માહિતી શોધી રહ્યા છીએ...' : 'Parsing...')
                : (gu ? 'બોલવા માટે માઇક દબાવો' : 'Tap to speak')}
          </p>
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'બોલેલું લખાણ' : 'Spoken Text'}
          </label>

          <textarea
            rows={3}
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              requestIdRef.current += 1;
              setCustomerMatches([]);
              setWarnings([]);
            }}
            className={inputClass}
            placeholder={
              gu
                ? 'રમેશભાઈને 500 રૂપિયા ઉધાર આપ્યા'
                : 'Ramesh paid 300 rupees'
            }
          />
        </div>

        <button
          type="button"
          disabled={parsing || listening}
          onClick={() => parseVoiceText(transcript)}
          className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {parsing && (
            <Loader2 size={18} className="animate-spin" />
          )}

          {gu ? 'લખાણમાંથી માહિતી શોધો' : 'Parse Voice Text'}
        </button>

        {warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <p className="font-semibold text-amber-800">
              {gu ? 'ચકાસવાની બાબતો' : 'Please Review'}
            </p>

            {warnings.map((warning, index) => (
              <p
                key={index}
                className="text-sm text-amber-700"
              >
                • {warning}
              </p>
            ))}
          </div>
        )}
      </section>

      <form
        onSubmit={openConfirmation}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
      >
        <h2 className="text-lg font-bold">
          {gu ? 'એન્ટ્રીની વિગતો' : 'Transaction Details'}
        </h2>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'ગ્રાહક શોધો' : 'Search Customer'}
          </label>

          <div className="flex items-center gap-2 rounded-xl border px-3">
            <Search size={18} className="text-slate-400" />

            <input
              type="search"
              value={customerSearch}
              onChange={(event) =>
                setCustomerSearch(event.target.value)
              }
              placeholder={
                gu ? 'નામ અથવા મોબાઇલ' : 'Name or phone'
              }
              className="w-full py-3 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'ગ્રાહક પસંદ કરો' : 'Select Customer'}
          </label>

          <select
            required
            value={form.customer_id}
            onChange={(event) =>
              updateField('customer_id', event.target.value)
            }
            className={inputClass}
          >
            <option value="">
              {customerLoading
                ? (gu ? 'શોધી રહ્યા છીએ...' : 'Searching...')
                : (gu ? 'ગ્રાહક પસંદ કરો' : 'Select Customer')}
            </option>

            {allCustomers
              .filter(
                (customer) =>
                  customer.is_active !== false
              )
              .map((customer) => (
                <option
                  key={customer.id}
                  value={customer.id}
                >
                  {customerLabel(customer, gu)}
                </option>
              ))}
          </select>

          {customerMatches.length > 1 && (
            <p className="text-sm text-amber-700 mt-2">
              {gu
                ? 'એકથી વધુ ગ્રાહકો મળ્યા છે. સાચો ગ્રાહક પસંદ કરો.'
                : 'Multiple customers matched. Select the correct customer.'}
            </p>
          )}
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'એન્ટ્રી પ્રકાર' : 'Transaction Type'}
          </label>

          <select
            required
            value={form.type}
            onChange={(event) =>
              updateField('type', event.target.value)
            }
            className={inputClass}
          >
            <option value="">
              {gu ? 'પ્રકાર પસંદ કરો' : 'Select Type'}
            </option>

            <option value="debit">
              {gu ? 'ઉધાર (Debit)' : 'Debit'}
            </option>

            <option value="credit">
              {gu ? 'જમા (Credit)' : 'Credit'}
            </option>
          </select>
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'રકમ (₹)' : 'Amount (₹)'}
          </label>

          <input
            required
            inputMode="decimal"
            value={form.amount}
            onChange={(event) =>
              updateField('amount', event.target.value)
            }
            placeholder="500.00"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'ગુજરાતી નોંધ' : 'Gujarati Note'}
          </label>

          <input
            maxLength={255}
            value={form.description_gu}
            onChange={(event) =>
              updateField(
                'description_gu',
                event.target.value
              )
            }
            className={inputClass}
          />
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'English નોંધ' : 'English Note'}
          </label>

          <input
            maxLength={255}
            value={form.description_en}
            onChange={(event) =>
              updateField(
                'description_en',
                event.target.value
              )
            }
            className={inputClass}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3"
          >
            <RotateCcw size={18} />
            {gu ? 'રીસેટ' : 'Reset'}
          </button>

          <button
            type="submit"
            disabled={parsing || saving}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl px-5 py-3 font-semibold disabled:opacity-50"
          >
            <Save size={18} />
            {gu ? 'ચકાસીને સેવ કરો' : 'Review & Save'}
          </button>
        </div>
      </form>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              gu ? 'એન્ટ્રીની ખાતરી' : 'Confirm Transaction'
            }
            className="w-full max-w-md bg-white rounded-2xl p-6 space-y-5"
          >
            <h2 className="text-xl font-bold">
              {gu ? 'એન્ટ્રીની ખાતરી કરો' : 'Confirm Transaction'}
            </h2>

            <div className="space-y-3">
              <p>
                <strong>{gu ? 'ગ્રાહક:' : 'Customer:'}</strong>{' '}
                {customerLabel(selectedCustomer, gu)}
              </p>

              <p>
                <strong>{gu ? 'પ્રકાર:' : 'Type:'}</strong>{' '}
                {form.type === 'debit'
                  ? (gu ? 'ઉધાર' : 'Debit')
                  : (gu ? 'જમા' : 'Credit')}
              </p>

              <p>
                <strong>{gu ? 'રકમ:' : 'Amount:'}</strong>{' '}
                ₹{normalizeAmount(form.amount)}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
                className="flex-1 border rounded-xl py-3"
              >
                {gu ? 'પાછા' : 'Back'}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={saveTransaction}
                className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
              >
                {saving
                  ? (gu ? 'સેવ થાય છે...' : 'Saving...')
                  : (gu ? 'સેવ કરો' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
