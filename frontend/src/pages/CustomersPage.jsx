import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, UserRound, X } from 'lucide-react';
import api from '../api/client';

const emptyForm = {
  name_en: '',
  name_gu: '',
  phone: '',
  address: '',
  notes: '',
  is_active: true,
};

export default function CustomersPage({ language }) {
  const gu = language === 'gu';

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [selected, setSelected] = useState(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    try {
      const { data } = await api.get('/api/v1/customers', {
        params: { search, page, per_page: 10 },
      });

      setCustomers(data.data.data);
      setLastPage(data.data.last_page);
      setTotal(data.data.total);
    } catch {
      setError('Unable to load customers.');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300);
    return () => clearTimeout(timer);
  }, [loadCustomers]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setError('');
    setFieldErrors({});
    setModal(true);
  };

  const openEdit = (customer) => {
    setEditing(customer);
    setForm({
      name_en: customer.name_en || '',
      name_gu: customer.name_gu || '',
      phone: customer.phone || '',
      address: customer.address || '',
      notes: customer.notes || '',
      is_active: customer.is_active,
    });
    setError('');
    setFieldErrors({});
    setModal(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFieldErrors({});

    try {
      if (editing) {
        await api.put('/api/v1/customers/' + editing.id, form);
      } else {
        await api.post('/api/v1/customers', form);
      }

      setModal(false);
      setPage(1);
      await loadCustomers();
    } catch (err) {
      setFieldErrors(err.response?.data?.errors || {});
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const viewCustomer = async (customer) => {
    setError('');

    try {
      const { data } = await api.get(
        '/api/v1/customers/' + customer.id
      );
      setSelected(data.data);
    } catch {
      setError('Unable to load customer details.');
    }
  };

  const disableCustomer = async (customer) => {
    if (!window.confirm(
      gu ? 'આ ગ્રાહકને નિષ્ક્રિય કરવો છે?' : 'Disable this customer?'
    )) return;

    try {
      await api.delete('/api/v1/customers/' + customer.id);
      await loadCustomers();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  };

  const updateField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const inputClass = 'w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-200';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {gu ? 'ગ્રાહક વ્યવસ્થાપન' : 'Customer Management'}
          </h1>
          <p className="text-slate-500 text-sm">
            {gu ? 'કુલ ગ્રાહકો' : 'Total Customers'}: {total}
          </p>
        </div>

        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-5 py-3 rounded-xl flex items-center gap-2"
        >
          <Plus size={18} />
          {gu ? 'નવો ગ્રાહક' : 'Add Customer'}
        </button>
      </div>

      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center gap-3 border rounded-xl px-4">
          <Search size={20} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={gu ? 'નામ અથવા મોબાઇલ શોધો' : 'Search name or phone'}
            className="w-full py-3 outline-none"
          />
        </div>
      </div>

      {error && !modal && (
        <p role="alert" className="text-red-600">{error}</p>
      )}

      <div className="smart-customers-table bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-left min-w-[650px]">
          <thead className="bg-slate-50 text-slate-500 text-sm">
            <tr>
              <th className="p-4">#</th>
              <th className="p-4">{gu ? 'ગ્રાહક' : 'Customer'}</th>
              <th className="p-4">{gu ? 'મોબાઇલ' : 'Phone'}</th>
              <th className="p-4">{gu ? 'સ્થિતિ' : 'Status'}</th>
              <th className="p-4">{gu ? 'કાર્યવાહી' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t">
                <td className="p-4">{customer.id}</td>
                <td className="p-4">
                  <div className="font-semibold">
                    {customer.name_gu || customer.name_en}
                  </div>
                  <div className="text-xs text-slate-500">
                    {customer.name_en || customer.name_gu}
                  </div>
                </td>
                <td className="p-4">{customer.phone || '—'}</td>
                <td className="p-4">
                  <span className={customer.is_active
                    ? 'text-green-700' : 'text-red-600'}>
                    {customer.is_active
                      ? (gu ? 'સક્રિય' : 'Active')
                      : (gu ? 'નિષ્ક્રિય' : 'Inactive')}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => viewCustomer(customer)}
                      className="text-blue-600 underline"
                    >
                      {gu ? 'હિસાબ' : 'Ledger'}
                    </button>
                    <button
                      onClick={() => openEdit(customer)}
                      className="text-slate-700 flex gap-1 items-center"
                    >
                      <Pencil size={15} />
                      {gu ? 'ફેરફાર' : 'Edit'}
                    </button>
                    {customer.is_active && (
                      <button
                        onClick={() => disableCustomer(customer)}
                        className="text-red-600"
                      >
                        {gu ? 'બંધ' : 'Disable'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && <p className="p-5 text-slate-500">Loading...</p>}

        {!loading && customers.length === 0 && (
          <p className="p-5 text-center text-slate-500">
            {gu ? 'કોઈ ગ્રાહક મળ્યો નથી' : 'No customers found'}
          </p>
        )}
      </div>

      <div className="flex justify-between items-center">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="border px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {gu ? 'પાછળ' : 'Previous'}
        </button>
        <span>{page} / {lastPage}</span>
        <button
          disabled={page >= lastPage}
          onClick={() => setPage((p) => p + 1)}
          className="border px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {gu ? 'આગળ' : 'Next'}
        </button>
      </div>

      {selected && (
        <div className="bg-white border rounded-2xl p-6">
          <div className="flex justify-between">
            <h2 className="font-bold text-xl">
              {selected.customer.name_gu || selected.customer.name_en}
            </h2>
            <button onClick={() => setSelected(null)}>
              <X size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
            {[
              [gu ? 'કુલ ઉધાર' : 'Total Debit', selected.total_debit],
              [gu ? 'કુલ જમા' : 'Total Credit', selected.total_credit],
              [gu ? 'કુલ બાકી' : 'Balance', selected.balance],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 p-4 rounded-xl">
                <p className="text-slate-500 text-sm">{label}</p>
                <p className="font-bold text-xl mt-2">
                  ₹{value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-bold text-xl">
                {editing
                  ? (gu ? 'ગ્રાહકમાં ફેરફાર' : 'Edit Customer')
                  : (gu ? 'નવો ગ્રાહક' : 'Add Customer')}
              </h2>
              <button onClick={() => setModal(false)}>
                <X size={22} />
              </button>
            </div>

            <form onSubmit={save} className="space-y-4">
              {[
                ['name_gu', gu ? 'ગુજરાતી નામ' : 'Gujarati Name'],
                ['name_en', gu ? 'English નામ' : 'English Name'],
                ['phone', gu ? 'મોબાઇલ' : 'Phone'],
                ['address', gu ? 'સરનામું' : 'Address'],
                ['notes', gu ? 'નોંધ' : 'Notes'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-2">
                    {label}
                  </label>
                  <input
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    className={inputClass}
                    maxLength={key.startsWith('name') ? 150 : undefined}
                  />
                  {fieldErrors[key]?.[0] && (
                    <p className="text-red-600 text-xs mt-1">
                      {fieldErrors[key][0]}
                    </p>
                  )}
                </div>
              ))}

              <p className="text-xs text-slate-500">
                {gu
                  ? 'ગુજરાતી અથવા English માં ઓછામાં ઓછું એક નામ જરૂરી છે.'
                  : 'At least one Gujarati or English name is required.'}
              </p>

              {editing && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => updateField(
                      'is_active', e.target.checked
                    )}
                  />
                  {gu ? 'સક્રિય ગ્રાહક' : 'Active Customer'}
                </label>
              )}

              {error && (
                <p role="alert" className="text-red-600 text-sm">
                  {error}
                </p>
              )}

              <button
                disabled={saving}
                type="submit"
                className="bg-blue-600 text-white w-full py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {saving
                  ? (gu ? 'સેવ થઈ રહ્યું છે...' : 'Saving...')
                  : (gu ? 'સેવ કરો' : 'Save Customer')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}