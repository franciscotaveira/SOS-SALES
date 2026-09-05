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
  canManage?: boolean;
}

export const ProductCatalogSection: React.FC<ProductCatalogSectionProps> = ({
  catalog: initialCatalog,
  onUpdateCatalog,
  canManage = true,
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
    if (!canManage) return;
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
    if (!canManage) return;
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    if (onUpdateCatalog) onUpdateCatalog(updated);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-[var(--sos-surface)] border-[var(--sos-border)] rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <ShoppingBag className="w-4.5 h-4.5 text-[var(--sos-success)]" />
            <h2 className="text-base font-bold font-heading">
              Tabela Oficial de Preços & Serviços
            </h2>
            {items.some((item) => Boolean(item.wabaProductLink)) ? (
              <span className="text-[8.5px] bg-[var(--sos-success)]/20 text-[var(--sos-success)] font-bold px-1.5 py-0.5 rounded-full border border-[var(--sos-success)]/30">
                Itens com link WABA
              </span>
            ) : (
              <span className="text-[8.5px] bg-[var(--sos-border)]/30 text-[var(--sos-muted)] font-bold px-1.5 py-0.5 rounded-full border border-[var(--sos-border)]">
                Cadastro no SOS Vendas
              </span>
            )}
          </div>
          <p className="text-[9.5px] text-[var(--sos-muted)]">
            Cadastre os serviços e valores praticados pela sua empresa. Este cadastro não ativa respostas automáticas sozinho.
          </p>
        </div>

        <button
          disabled={!canManage}
          onClick={() => {
            const now = Date.now();
            setEditingItem({
              id: `prod-custom-${now}`,
              sku: `SKU-${now.toString().slice(-4)}`,
              name: '',
              category: 'Serviços',
              description: '',
              basePrice: 0,
              minPromoPrice: 0,
              durationOrExecutionTime: '',
              imageUrl: '',
              inStock: true,
              tags: ['Novo'],
              frequentlyAsked: [],
            });
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--sos-success)] hover:bg-[var(--sos-success)]/90 text-white rounded-lg text-[9px] font-bold transition-all shadow-2xs shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Adicionar Produto / Serviço</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-[var(--sos-surface)] p-2.5 rounded-lg border border-[var(--sos-border)] shadow-2xs">
        <div className="relative flex-1 w-full">
          <Search className="w-3.5 h-3.5 text-[var(--sos-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, SKU, tag ou descrição..."
            className="w-full pl-8 pr-2.5 py-1 text-xs bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg focus:bg-[var(--sos-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--sos-success)]"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          <Filter className="w-3 h-3 text-[var(--sos-muted)] shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 rounded-lg text-[8.5px] font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-[var(--sos-ink)] text-white'
                  : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] hover:bg-[var(--sos-border)]/50'
              }`}
            >
              {cat === 'all' ? 'Todos os Itens' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products & Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg overflow-hidden shadow-2xs hover:border-[var(--sos-border)]/50 transition-all flex flex-col justify-between group"
          >
            <div>
              {/* Product Header with Image and Price */}
              <div className="flex items-start gap-3 p-3">
                <div className="w-16 h-16 rounded-lg bg-[var(--sos-background)] overflow-hidden shrink-0 border border-[var(--sos-border)] relative">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {item.wabaProductLink && (
                    <span className="absolute bottom-1 right-1 bg-[var(--sos-success)] text-white p-0.5 rounded shadow-2xs" title="Sincronizado WABA">
                      <Zap className="w-2 h-2" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-mono text-[var(--sos-muted)] font-semibold uppercase">
                      {item.sku}
                    </span>
                    <span className="text-[8.5px] bg-[var(--sos-border)]/30 text-[var(--sos-muted)] px-1.5 py-0.2 rounded font-medium">
                      {item.category}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-[var(--sos-ink)] leading-snug line-clamp-1 font-heading">
                    {item.name}
                  </h3>

                  <p className="text-[9px] text-[var(--sos-muted)] line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Price Breakdown & Margin Threshold */}
              <div className="px-3 py-2 bg-[var(--sos-background)]/50 border-t border-b border-[var(--sos-border)] grid grid-cols-3 gap-1.5 text-[9px]">
                <div>
                  <span className="text-[8.5px] text-[var(--sos-muted)] block font-semibold">Preço Base</span>
                  <span className="font-bold text-[var(--sos-ink)]">
                    R$ {(Number(item.basePrice) || 0).toFixed(2)}
                  </span>
                </div>

                <div>
                  <span className="text-[8.5px] text-[var(--sos-success)] block font-semibold">Alçada Mínima IA</span>
                  <span className="font-bold text-[var(--sos-success)]">
                    R$ {(Number(item.minPromoPrice ?? item.basePrice) || 0).toFixed(2)}
                  </span>
                </div>

                {item.durationOrExecutionTime && (
                  <div>
                    <span className="text-[8.5px] text-[var(--sos-muted)] block font-semibold">Duração Estimada</span>
                    <span className="font-medium text-[var(--sos-ink)] flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 text-[var(--sos-muted)]" />
                      {item.durationOrExecutionTime}
                    </span>
                  </div>
                )}
              </div>

              {/* Tags & WABA Meta Catalog Link */}
              <div className="p-3 pt-1.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  {Array.isArray(item.tags) && item.tags.some((t) => typeof t === 'string' && (t.toLowerCase().includes('áudio') || t.toLowerCase().includes('suzana'))) && (
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded-full bg-[var(--sos-success-subtle)] text-[var(--sos-success)] font-bold border border-[var(--sos-success)]/30 flex items-center gap-0.5 shadow-2xs">
                      🎙️ Áudio de Vendas no Vault
                    </span>
                  )}
                  {Array.isArray(item.tags) && item.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[8.5px] px-1 py-0.5 rounded bg-[var(--sos-border)]/30 text-[var(--sos-muted)] font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                  {item.inStock ? (
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-[var(--sos-success-subtle)] text-[var(--sos-success)] font-semibold ml-auto flex items-center gap-0.5">
                      <CheckCircle2 className="w-2 h-2" /> Disponível
                    </span>
                  ) : (
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] font-semibold ml-auto">
                      Indisponível
                    </span>
                  )}
                </div>

                {/* Frequently Asked Snippet */}
                {Array.isArray(item.frequentlyAsked) && item.frequentlyAsked.length > 0 && item.frequentlyAsked[0] && (
                  <div className="p-2 rounded-lg bg-[var(--sos-warning-subtle)] border border-[var(--sos-warning)]/30 text-[9px] text-[var(--sos-warning)] space-y-0.5">
                    <span className="font-bold flex items-center gap-0.5 text-[8.5px] uppercase text-[var(--sos-warning)]">
                      <Sparkles className="w-2.5 h-2.5 text-[var(--sos-warning)]" /> FAQ do Produto
                    </span>
                    <p className="font-semibold">{item.frequentlyAsked[0]?.question}</p>
                    <p className="font-normal italic">
                      "{item.frequentlyAsked[0]?.answer}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="px-3 py-2 bg-[var(--sos-background)] border-t border-[var(--sos-border)] flex items-center justify-between">
              {item.wabaProductLink ? (
                <a
                  href={item.wabaProductLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[9px] text-[var(--sos-success)] hover:underline font-semibold flex items-center gap-0.5"
                >
                  <ExternalLink className="w-2.5 h-2.5" /> Abrir Card WABA
                </a>
              ) : (
                <span className="text-[9px] text-[var(--sos-muted)]">Sem link WABA</span>
              )}

              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => {
                    setEditingItem(item);
                    setIsAddModalOpen(true);
                  }}
                  disabled={!canManage}
                  className="p-1 text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-border)]/30 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  title="Editar Item"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  disabled={!canManage}
                  className="p-1 text-[var(--sos-muted)] hover:text-[var(--sos-danger)] hover:bg-[var(--sos-danger-subtle)] rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  title="Excluir do Catálogo"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {isAddModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl max-w-lg w-full p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--sos-border)]">
              <h3 className="text-xs font-bold text-[var(--sos-ink)] font-heading">
                {items.some((i) => i.id === editingItem.id)
                  ? 'Editar Produto / Serviço'
                  : 'Novo Produto ou Serviço no Catálogo'}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItem(null);
                }}
                className="text-[var(--sos-muted)] hover:text-[var(--sos-ink)] text-base font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-[9px]">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="col-span-2">
                  <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">Nome do Item</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                    placeholder="Ex: Escova Modelada..."
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">SKU</label>
                  <input
                    type="text"
                    value={editingItem.sku}
                    onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] font-mono focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">Categoria</label>
                  <input
                    type="text"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">Duração Estimada</label>
                  <input
                    type="text"
                    value={editingItem.durationOrExecutionTime || ''}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, durationOrExecutionTime: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                    placeholder="Ex: 40 minutos"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">Descrição Comercial</label>
                <textarea
                  rows={2}
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">Preço Base (R$)</label>
                  <input
                    type="number"
                    value={editingItem.basePrice}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, basePrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] font-bold focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">
                    Preço Mínimo / Alçada IA (R$)
                  </label>
                  <input
                    type="number"
                    value={editingItem.minPromoPrice}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, minPromoPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] font-bold text-[var(--sos-success)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">URL da Foto</label>
                <input
                  type="text"
                  value={editingItem.imageUrl}
                  onChange={(e) => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-success)] outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-[var(--sos-border)]">
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItem(null);
                }}
                className="px-2.5 py-1 text-[9px] text-[var(--sos-muted)] hover:bg-[var(--sos-border)]/30 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveItem(editingItem)}
                disabled={!canManage}
                className="px-3 py-1 text-[9px] font-bold text-white bg-[var(--sos-success)] hover:bg-[var(--sos-success)]/90 rounded-lg transition shadow-2xs"
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
