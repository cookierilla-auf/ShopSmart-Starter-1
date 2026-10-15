import { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../services/api.js';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categoryCatalog, setCategoryCatalog] = useState({ values: ['All'], loaded: false, error: '' });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addToCart, cartMessage } = useCart();
  const categories = categoryCatalog.values;

  useEffect(() => {
    let active = true;
    // Keep a full-catalog snapshot so searching never removes category choices.
    api.getProducts()
      .then((data) => {
        if (!active) return;
        setCategoryCatalog({ values: ['All', ...new Set(data.products.map((product) => product.category))], loaded: true, error: '' });
      })
      .catch(() => {
        if (!active) return;
        setCategoryCatalog((current) => current.loaded ? current : {
          ...current, error: 'Could not load category choices. Clear search to retry.'
        });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const query = search.trim();
    setLoading(true);
    setError('');
    api.getProducts(query)
      .then((data) => {
        if (!active) return;
        setProducts(data.products);
        if (!query) {
          setCategoryCatalog({ values: ['All', ...new Set(data.products.map((product) => product.category))], loaded: true, error: '' });
        }
      })
      .catch((caught) => active && setError(caught.message))
      .finally(() => active && setLoading(false));
    // Ignore every outcome from this request after search changes or unmounting.
    return () => { active = false; };
  }, [search]);

  const visibleProducts = products.filter((product) => category === 'All' || product.category === category);

  const displayedProducts = [...visibleProducts].sort((a, b) => {
    if (sort === 'price-asc') return Number(a.price) - Number(b.price);
    if (sort === 'price-desc') return Number(b.price) - Number(a.price);
    if (sort === 'name-asc') return a.name.localeCompare(b.name);
    return 0;
  });

  return (
    <section>
      <div className="hero">
        <div>
          <p className="eyebrow">BSIT FULL-STACK PROJECT</p>
          <h1>Technology for study, work and play</h1>
          <p>Browse the starter catalog, build a cart and complete a simulated order.</p>
        </div>
      </div>

      <div className="toolbar">
        <label>
          <span>Search products</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try keyboard" />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="default">Default</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name-asc">Name: A to Z</option>
          </select>
        </label>
      </div>

      <StatusMessage>{cartMessage}</StatusMessage>
      {categoryCatalog.error && <StatusMessage type="error">{categoryCatalog.error}</StatusMessage>}
      {loading && <StatusMessage>Loading products…</StatusMessage>}
      {error && <StatusMessage type="error">{error} Make sure the backend is running.</StatusMessage>}
      {!loading && !error && visibleProducts.length === 0 && <StatusMessage>No products match your filters.</StatusMessage>}

      {!loading && !error && <div className="product-grid">
        {displayedProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAddToCart={addToCart} />
        ))}
      </div>}
    </section>
  );
}
