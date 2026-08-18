import React from 'react';
import { ProductCatalogItem } from '../../types/intelligence';
import {
  ShoppingBag,
  Plus,
  Tag,
  Clock,
  ExternalLink,
  Percent,
  CheckCircle2,
  Image as ImageIcon,
  DollarSign,
  Search,
  Filter,
  Layers,
  Sparkles,
  Zap,
  Edit2,
  Trash2,
  Check,
} from 'lucide-react';

interface ProductCatalogSectionProps {
  catalog: ProductCatalogItem[];
  onUpdateCatalog?: (items: ProductCatalogItem[]) => void;
}

export const ProductCatalogSection: React.FC<ProductCatalogSectionProps> = ({
  catalog: initialCatalog,
  onUpdateCatalog,
}) => {
  const [items, setItems] = React.useState<ProductCatalogItem[]>(initialCatalog);
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<ProductCatalogItem | null>(null);

  React.useEffect(() => {
    setItems(initialCatalog);
  }, [initialCatalog]);

  const categories = React.useMemo(() => {
    const cats = new Set(items.map((i) => i.category));
    return ['all', ...Array.from(cats)];
  }, [items]);

  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase()) ||
        item.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      return true;
    });
  }, [items, search, selectedCategory]);

  const handleSaveItem = (itemToSave: ProductCatalogItem) => {
    let updated: ProductCatalogItem[];
    if (items.some((i) => i.id === itemToSave.id)) {
      updated = items.map((i) => (i.id === itemToSave.id ? itemToSave : i));
    } else {
      updated = [itemToSave, ...items];
    }
    setItems(updated);
    if (onUpdateCatalog) onUpdateCatalog(updated);
    setIsAddModalOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    if (onUpdateCatalog) onUpdateCatalog(updated);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-xl p-5 border border-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#00A884]" />
            <h2 className="text-lg font-bold font-heading">
              Tabela Oficial de Preços & Serviços
            </h2>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-800">
              Sincronizado no WhatsApp
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Cadastre os serviços e valores praticados pela sua empresa. A IA usa esses dados exatos para informar valores, duração e enviar links de agendamento ou pagamento.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingItem({
              id: `prod-custom-${Date.now()}`,
              sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
              name: '',
              category: 'Serviços',
              description: '',
              basePrice: 100,
              minPromoPrice: 85,
              durationOrExecutionTime: '30 min',
              imageUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&auto=format&fit=crop&q=80',
              inStock: true,
              tags: ['Novo'],
              frequentlyAsked: [],
            });
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#00A884] hover:bg-[#008f6f] text-white rounded-lg text-xs font-bold transition-all shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Adicionar Produto / Serviço</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, SKU, tag ou descrição..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'Todos os Itens' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products & Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between group"
          >
            <div>
              {/* Product Header with Image and Price */}
              <div className="flex items-start gap-3.5 p-4">
                <div className="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 relative">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {item.wabaProductLink && (
                    <span className="absolute bottom-1 right-1 bg-emerald-600 text-white p-0.5 rounded shadow-xs" title="Sincronizado WABA">
                      <Zap className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">
                      {item.sku}
                    </span>
                    <span className="text-[9.5px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                      {item.category}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-1 font-heading">
                    {item.name}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Price Breakdown & Margin Threshold */}
              <div className="px-4 py-2.5 bg-slate-50/80 border-t border-b border-slate-100 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block">Preço Base</span>
                  <span className="font-bold text-slate-900">
                    R$ {(Number(item.basePrice) || 0).toFixed(2)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-600 font-semibold block">Alçada Mínima IA</span>
                  <span className="font-bold text-emerald-700">
                    R$ {(Number(item.minPromoPrice ?? item.basePrice) || 0).toFixed(2)}
                  </span>
                </div>

                {item.durationOrExecutionTime && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Duração Estimada</span>
                    <span className="font-medium text-slate-700 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {item.durationOrExecutionTime}
                    </span>
                  </div>
                )}
              </div>

              {/* Tags & WABA Meta Catalog Link */}
              <div className="p-4 pt-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-1">
                  {Array.isArray(item.tags) && item.tags.some((t) => typeof t === 'string' && (t.toLowerCase().includes('áudio') || t.toLowerCase().includes('suzana'))) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 flex items-center gap-1 shadow-2xs">
                      🎙️ Áudio de Vendas no Vault
                    </span>
                  )}
                  {Array.isArray(item.tags) && item.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                  {item.inStock ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold ml-auto flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Disponível
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold ml-auto">
                      Indisponível
                    </span>
                  )}
                </div>

                {/* Frequently Asked Snippet */}
                {Array.isArray(item.frequentlyAsked) && item.frequentlyAsked.length > 0 && item.frequentlyAsked[0] && (
                  <div className="p-2 rounded-lg bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 space-y-0.5">
                    <span className="font-bold flex items-center gap-1 text-[10px] uppercase text-amber-800">
                      <Sparkles className="w-3 h-3 text-amber-600" /> FAQ do Produto
                    </span>
                    <p className="font-semibold">{item.frequentlyAsked[0]?.question}</p>
                    <p className="text-amber-800 font-normal italic">
                      "{item.frequentlyAsked[0]?.answer}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {item.wabaProductLink ? (
                <a
                  href={item.wabaProductLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[#00A884] hover:underline font-semibold flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> Abrir Card WABA
                </a>
              ) : (
                <span className="text-[10px] text-slate-400">Sem link WABA</span>
              )}

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingItem(item);
                    setIsAddModalOpen(true);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
                  title="Editar Item"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                  title="Excluir do Catálogo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {isAddModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 font-heading">
                {items.some((i) => i.id === editingItem.id)
                  ? 'Editar Produto / Serviço'
                  : 'Novo Produto ou Serviço no Catálogo'}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItem(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome do Item</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                    placeholder="Ex: Escova Modelada..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">SKU</label>
                  <input
                    type="text"
                    value={editingItem.sku}
                    onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Duração Estimada</label>
                  <input
                    type="text"
                    value={editingItem.durationOrExecutionTime || ''}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, durationOrExecutionTime: e.target.value })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                    placeholder="Ex: 40 minutos"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Descrição Comercial</label>
                <textarea
                  rows={2}
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Preço Base (R$)</label>
                  <input
                    type="number"
                    value={editingItem.basePrice}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, basePrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Preço Mínimo / Alçada IA (R$)
                  </label>
                  <input
                    type="number"
                    value={editingItem.minPromoPrice}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, minPromoPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold text-emerald-700 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">URL da Foto</label>
                <input
                  type="text"
                  value={editingItem.imageUrl}
                  onChange={(e) => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItem(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveItem(editingItem)}
                className="px-4 py-1.5 bg-[#00A884] hover:bg-[#008f6f] text-white text-xs font-bold rounded-lg shadow-sm"
              >
                Salvar Produto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
