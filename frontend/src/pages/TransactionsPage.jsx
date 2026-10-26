import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react';
import api from '../api/client';

const createKey = () => crypto.randomUUID();

const emptyForm = {
  customer_id: '',
  type: 'debit',
  amount: '',
  description_en: '',
  description_gu: '',
};

function normalizeAmount(value) {
  const text = String(value).trim();

  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [rupees, decimals = ''] = text.split('.');
  const whole = rupees.replace(/^0+(?=\d)/, '');
  const normalized = whole + '.' + decimals.padEnd(2, '0');

  if (/^0+\.00$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function getError(error) {
  const errors = error.response?.data?.errors;

  if (errors) {
    const first = Object.values(errors).flat()[0];
    if (first) return String(first);
  }

  return (
    error.response?.data?.message ||
    'Something went wrong. Please try again.'
  );
}

export default function TransactionsPage({ language = 'gu' }) {
  const gu = language === 'gu';

  const [form, setForm] = useState({ ...emptyForm });
  const [requestKey, setRequestKey] = useState(createKey);

  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [reverseItem, setReverseItem] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseKey, setReverseKey] = useState(createKey);
  const [reversing, setReversing] = useState(false);

  const updateField = (key, value) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
    setRequestKey(createKey());
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

      setCustomers(response.data.data.data);
    } catch (err) {
      setError(getError(err));
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setListLoading(true);

    try {
      const response = await api.get('/api/v1/transactions', {
        params: {
          page,
          per_page: 10,
        },
      });

      setTransactions(response.data.data.data);
      setLastPage(response.data.data.last_page);
    } catch (err) {
      setError(getError(err));
    } finally {
      setListLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(customerSearch);
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearch, loadCustomers]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const submitTransaction = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!form.customer_id) {
      setError(
        gu ? 'ગ્રાહક પસંદ કરો.' : 'Please select a customer.'
      );
      return;
    }

    const amount = normalizeAmount(form.amount);

    if (!amount) {
      setError(
        gu
          ? 'યોગ્ય રકમ લખો. ઉદાહરણ: 50 અથવા 50.50'
          : 'Enter a valid amount, for example 50 or 50.50.'
      );
      return;
    }

    setSaving(true);

    try {
      const response = await api.post('/api/v1/transactions', {
        customer_id: Number(form.customer_id),
        type: form.type,
        amount,
        description_en: form.description_en.trim() || null,
        description_gu: form.description_gu.trim() || null,
        idempotency_key: requestKey,
      });

      setMessage(
        response.data.replayed
          ? (
              gu
                ? 'આ એન્ટ્રી પહેલેથી સેવ થયેલી છે.'
                : 'This entry was already saved.'
            )
          : (
              gu
                ? 'હિસાબ સફળતાપૂર્વક સેવ થયો.'
                : 'Transaction saved successfully.'
            )
      );

      setForm((previous) => ({
        ...emptyForm,
        customer_id: previous.customer_id,
        type: previous.type,
      }));

      setRequestKey(createKey());
      setPage(1);
      await loadTransactions();
    } catch (err) {
      setError(getError(err));

      if (err.response?.status === 409) {
        setRequestKey(createKey());
      }
    } finally {
      setSaving(false);
    }
  };

  const openReverse = (transaction) => {
    setReverseItem(transaction);
    setReverseReason('');
    setReverseKey(createKey());
    setError('');
    setMessage('');
  };

  const submitReverse = async (event) => {
    event.preventDefault();

    if (!reverseItem || reverseReason.trim().length < 3) {
      setError(
        gu
          ? 'ઓછામાં ઓછા 3 અક્ષરનું કારણ લખો.'
          : 'Please enter a reason of at least 3 characters.'
      );
      return;
    }

    setReversing(true);
    setError('');
    setMessage('');

    try {
      await api.post(
        '/api/v1/transactions/' + reverseItem.id + '/reverse',
        {
          reason: reverseReason.trim(),
          idempotency_key: reverseKey,
        }
      );

      setReverseItem(null);
      setReverseReason('');
      setReverseKey(createKey());

      setMessage(
        gu
          ? 'ખોટી એન્ટ્રી સફળતાપૂર્વક રદ થઈ.'
          : 'Transaction reversed successfully.'
      );

      await loadTransactions();
    } catch (err) {
      setError(getError(err));

      if (err.response?.status === 409) {
        setReverseKey(createKey());
      }
    } finally {
      setReversing(false);
    }
  };

  const customerName = (customer) => {
    if (!customer) return 'Customer';

    return gu
      ? (customer.name_gu || customer.name_en)
      : (customer.name_en || customer.name_gu);
  };

  const inputClass =
    'w-full border border-slate-300 rounded-xl px-4 py-3 ' +
    'outline-none focus:ring-2 focus:ring-blue-200';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {gu ? 'ઉધાર અને જમા એન્ટ્રી' : 'Debit & Credit Entry'}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {gu
            ? 'ગ્રાહકના ઉધાર અને જમાનો સંપૂર્ણ હિસાબ રાખો.'
            : 'Manage customer credit and payment entries.'}
        </p>
      </div>

      {message && (
        <div
          role="status"
          className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 flex gap-2 items-center"
        >
          <CheckCircle2 size={20} />
          {message}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={submitTransaction}
        className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-5"
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => updateField('type', 'debit')}
            className={
              'rounded-xl border p-4 flex items-center justify-center gap-2 font-semibold ' +
              (form.type === 'debit'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-slate-200 text-slate-600')
            }
          >
            <ArrowUpRight size={20} />
            {gu ? 'ઉધાર' : 'Debit'}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => updateField('type', 'credit')}
            className={
              'rounded-xl border p-4 flex items-center justify-center gap-2 font-semibold ' +
              (form.type === 'credit'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-slate-200 text-slate-600')
            }
          >
            <ArrowDownLeft size={20} />
            {gu ? 'જમા' : 'Credit'}
          </button>
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'ગ્રાહક શોધો' : 'Search Customer'}
          </label>
          <div className="flex items-center gap-2 border rounded-xl px-3">
            <Search size={18} className="text-slate-400" />
            <input
              type="search"
              value={customerSearch}
              onChange={(event) =>
                setCustomerSearch(event.target.value)
              }
              placeholder={
                gu ? 'નામ અથવા મોબાઇલ નંબર' : 'Name or phone'
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
            disabled={saving}
            value={form.customer_id}
            onChange={(event) =>
              updateField('customer_id', event.target.value)
            }
            className={inputClass}
          >
            <option value="">
              {customerLoading
                ? (gu ? 'શોધી રહ્યા છીએ...' : 'Searching...')
                : (gu ? 'ગ્રાહક પસંદ કરો' : 'Choose Customer')}
            </option>

            {customers
              .filter((customer) => customer.is_active)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name_gu || customer.name_en}
                  {' / '}
                  {customer.name_en || customer.name_gu}
                  {customer.phone
                    ? ' - ' + customer.phone
                    : ''}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu ? 'રકમ (₹)' : 'Amount (₹)'}
          </label>
          <input
            required
            disabled={saving}
            inputMode="decimal"
            value={form.amount}
            onChange={(event) =>
              updateField('amount', event.target.value)
            }
            placeholder="50.00"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu
              ? 'ગુજરાતી નોંધ (વૈકલ્પિક)'
              : 'Gujarati Note (Optional)'}
          </label>
          <input
            disabled={saving}
            value={form.description_gu}
            onChange={(event) =>
              updateField('description_gu', event.target.value)
            }
            maxLength={255}
            placeholder="કરિયાણાનો સામાન"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block font-medium mb-2">
            {gu
              ? 'English નોંધ (વૈકલ્પિક)'
              : 'English Note (Optional)'}
          </label>
          <input
            disabled={saving}
            value={form.description_en}
            onChange={(event) =>
              updateField('description_en', event.target.value)
            }
            maxLength={255}
            placeholder="Grocery items"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-semibold flex justify-center items-center gap-2 disabled:opacity-50"
        >
          <PlusCircle size={19} />
          {saving
            ? (gu ? 'સેવ થઈ રહ્યું છે...' : 'Saving...')
            : (gu ? 'હિસાબ સેવ કરો' : 'Save Transaction')}
        </button>
      </form>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="font-bold text-lg">
            {gu ? 'તાજેતરની એન્ટ્રીઓ' : 'Recent Transactions'}
          </h2>
        </div>

        <div className="divide-y divide-slate-100">
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {customerName(transaction.customer)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {(gu
                    ? transaction.description_gu ||
                      transaction.description_en
                    : transaction.description_en ||
                      transaction.description_gu
                  ) || '—'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(
                    transaction.transaction_at
                  ).toLocaleString(gu ? 'gu-IN' : 'en-IN')}
                </p>

                {transaction.reversal_of_id && (
                  <span className="text-xs text-amber-700">
                    {gu
                      ? 'રદ કરેલી એન્ટ્રી'
                      : 'Reversal Entry'}
                  </span>
                )}
              </div>

              <div className="text-right">
                <p
                  className={
                    'text-xl font-bold ' +
                    (transaction.type === 'debit'
                      ? 'text-red-600'
                      : 'text-green-600')
                  }
                >
                  {transaction.type === 'debit' ? '+' : '−'}
                  ₹{transaction.amount}
                </p>

                {!transaction.reversal_of_id && (
                  <button
                    type="button"
                    onClick={() => openReverse(transaction)}
                    className="text-sm text-slate-500 hover:text-red-600 mt-2 flex items-center gap-1 ml-auto"
                  >
                    <RefreshCcw size={14} />
                    {gu ? 'રદ કરો' : 'Reverse'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {!listLoading && transactions.length === 0 && (
            <p className="text-center text-slate-500 p-8">
              {gu
                ? 'હજુ કોઈ એન્ટ્રી નથી.'
                : 'No transactions found.'}
            </p>
          )}

          {listLoading && (
            <p className="text-center text-slate-500 p-5">
              {gu ? 'લોડ થઈ રહ્યું છે...' : 'Loading...'}
            </p>
          )}
        </div>

        <div className="flex justify-between items-center p-4 border-t">
          <button
            type="button"
            disabled={page <= 1 || listLoading}
            onClick={() => setPage((value) => value - 1)}
            className="border rounded-lg px-4 py-2 disabled:opacity-40"
          >
            <ChevronLeft size={17} className="inline" />
            {gu ? 'પાછળ' : 'Previous'}
          </button>

          <span className="text-sm">
            {page} / {lastPage}
          </span>

          <button
            type="button"
            disabled={page >= lastPage || listLoading}
            onClick={() => setPage((value) => value + 1)}
            className="border rounded-lg px-4 py-2 disabled:opacity-40"
          >
            {gu ? 'આગળ' : 'Next'}
            <ChevronRight size={17} className="inline" />
          </button>
        </div>
      </section>

      {reverseItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              gu ? 'એન્ટ્રી રદ કરો' : 'Reverse Transaction'
            }
            className="bg-white w-full max-w-md rounded-2xl p-6"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {gu
                  ? 'એન્ટ્રી રદ કરો'
                  : 'Reverse Transaction'}
              </h2>

              <button
                type="button"
                disabled={reversing}
                onClick={() => setReverseItem(null)}
              >
                <X size={22} />
              </button>
            </div>

            <p className="text-slate-600 mb-4">
              {gu
                ? 'Original entry delete નહીં થાય. તેના બદલે નવી reversal entry બનશે.'
                : 'The original entry will remain in history. A reversal entry will be created.'}
            </p>

            <form
              onSubmit={submitReverse}
              className="space-y-4"
            >
              <div>
                <label className="block font-medium mb-2">
                  {gu
                    ? 'રદ કરવાનું કારણ'
                    : 'Reason for Reversal'}
                </label>
                <textarea
                  required
                  minLength={3}
                  maxLength={255}
                  rows={3}
                  disabled={reversing}
                  value={reverseReason}
                  onChange={(event) =>
                    setReverseReason(event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={reversing}
                className="w-full bg-red-600 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
              >
                {reversing
                  ? (gu
                      ? 'રદ થઈ રહ્યું છે...'
                      : 'Reversing...')
                  : (gu
                      ? 'રદ કરવાની ખાતરી કરો'
                      : 'Confirm Reversal')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}