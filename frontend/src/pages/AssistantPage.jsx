import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/api.js';

const MODE_LABELS = {
  ai: 'AI draft verified against the catalog',
  rules: 'Answer from ShopSmart catalog rules',
  'no-match': 'No matching product'
};

const peso = (amount) => `₱${Number(amount).toLocaleString('en-PH')}`;

export default function AssistantPage() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask(event) {
    event.preventDefault(); setError(''); setResult(null); setLoading(true);
    try { setResult(await api.askAssistant(question)); }
    catch (caught) { setError(caught.message || 'The assistant could not answer right now. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <section className="assistant-layout">
      <div>
        <p className="eyebrow">GROUNDED ASSISTANT</p>
        <h1>Find a product</h1>
        <p>Answers use only the current ShopSmart catalog. Prices and stock are checked on the server before anything is shown.</p>
        <form onSubmit={ask}>
          <label>Your question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} minLength="3" maxLength="300" placeholder="Which keyboard is below ₱2,000?" required /></label>
          <button disabled={loading}>{loading ? 'Searching…' : 'Ask ShopSmart'}</button>
        </form>
      </div>
      <div className="assistant-answer" aria-busy={loading} aria-live="polite">
        <h2>Assistant response</h2>
        <StatusMessage type="error">{error}</StatusMessage>
        {loading && <StatusMessage>Checking the current catalog…</StatusMessage>}
        {!result && !error && !loading && <p>Your answer will appear here.</p>}
        {result && <>
          {MODE_LABELS[result.mode] && <p className={`answer-mode ${result.mode}`}>{MODE_LABELS[result.mode]}</p>}
          <StatusMessage>{result.notice}</StatusMessage>
          <p>{result.answer}</p>
          {result.recommendedProducts.length > 0 && <div className="recommendations">
            {result.recommendedProducts.map((product) => (
              <Link key={product.id} to={`/products/${product.id}`}>
                {product.name} — {peso(product.price)}{product.stock != null && <span> · {product.stock} in stock</span>}
              </Link>
            ))}
          </div>}
          <div className="assistant-sources">
            <h3>Sources</h3>
            {result.sources.length === 0
              ? <p>No catalog product supports a recommendation for this question.</p>
              : <ul>
                {result.sources.map((source) => (
                  <li key={source.id}>
                    <Link to={`/products/${source.id}`}>Product #{source.id} · {source.name}</Link>
                    {source.price != null && <> · {peso(source.price)}</>}
                    {source.stock != null && <> · {source.stock} in stock</>}
                  </li>
                ))}
              </ul>}
          </div>
        </>}
      </div>
    </section>
  );
}
