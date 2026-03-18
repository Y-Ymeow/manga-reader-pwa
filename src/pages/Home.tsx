import { useState, useEffect } from "preact/hooks";
import { navigate } from "@routes/index";
import { Manga, Category, ChapterList } from "@db/index";
import type { MangaRecord, CategoryRecord, ChapterListRecord } from "@db/index";
import { waitForDatabase } from "@db/global";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";

interface HomeProps {}

export function Home({}: HomeProps) {
  const [mangas, setMangas] = useState<MangaRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // 分类管理相关
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<{
    id: string | number;
    name: string;
  } | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<
    string | number | null
  >(null);

  // 加载分类和漫画
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // 确保数据库已初始化
        await waitForDatabase();
        
        // 加载分类
        const cats = await Category.findMany({ sort: 'sort' });
        setCategories(cats as CategoryRecord[]);

        // 加载漫画
        await loadMangas(activeCategory);
      } catch (e) {
        console.debug(await Category.findMany({ sort: 'sort' }));
        console.error("Failed to load home data:", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeCategory]);

  const loadMangas = async (categoryId: string) => {
    try {
      let mangasData: MangaRecord[];

      if (categoryId === "all") {
        // 全部漫画
        mangasData = (await Manga.findMany({
          where: { isFavorite: true },
          sort: { field: 'favoriteAt', order: 'desc' },
        })) as MangaRecord[];
      } else {
        // 特定分类
        mangasData = (await Manga.findMany({
          where: { isFavorite: true, categoryId },
          sort: { field: 'favoriteAt', order: 'desc' },
        })) as MangaRecord[];
      }

      setMangas(mangasData);
    } catch (e) {
      console.error("Failed to load mangas:", e);
    }
  };

  // 创建分类
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;

    try {
      const maxSort = categories.reduce(
        (max, cat) => Math.max(max, cat.sort || 0),
        0,
      );
      await Category.create({
        name: newCategoryName.trim(),
        sort: maxSort + 1,
      });
      setNewCategoryName("");
      // 重新加载分类
      const cats = await Category.findMany({ sort: 'sort' });
      setCategories(cats as CategoryRecord[]);
    } catch (e) {
      console.error("Failed to create category:", e);
    }
  };

  // 编辑分类
  const handleEditCategory = async () => {
    if (!editingCategory || !editCategoryName.trim()) return;

    try {
      await Category.update(editingCategory.id, {
        name: editCategoryName.trim(),
      });
      setEditingCategory(null);
      setEditCategoryName("");
      // 重新加载分类
      const cats = await Category.findMany({ sort: 'sort' });
      setCategories(cats as CategoryRecord[]);
    } catch (e) {
      console.error("Failed to edit category:", e);
    }
  };

  // 删除分类
  const handleDeleteCategory = async (id: string | number) => {
    try {
      // 先将该分类下的漫画移到"全部"
      await Manga.updateMany(
        { categoryId: String(id) },
        { categoryId: undefined },
      );
      // 删除分类
      await Category.delete(id);
      // 重新加载分类
      const cats = await Category.findMany({ sort: 'sort' });
      setCategories(cats as CategoryRecord[]);
      // 如果当前选中的是被删除的分类，切换到"全部"
      if (activeCategory === String(id)) {
        setActiveCategory("all");
      }
      setDeleteConfirmId(null);
    } catch (e) {
      console.error("Failed to delete category:", e);
    }
  };

  const startEditCategory = (cat: CategoryRecord) => {
    setEditingCategory({ id: cat.id, name: cat.name });
    setEditCategoryName(cat.name);
  };

  const handleMangaClick = (manga: MangaRecord) => {
    navigate("manga", { id: manga.id });
  };

  const handleExplore = () => {
    navigate("explore");
  };

  if (loading) {
    return (
      <div class="flex items-center justify-center h-full">
        <p class="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div class="h-full flex flex-col">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h1 class="text-xl font-bold text-white">书架</h1>
        <button
          onClick={handleExplore}
          class="px-4 py-1.5 bg-[#e94560] text-white rounded-lg text-sm"
        >
          发现
        </button>
      </div>

      {/* Category Tabs */}
      <div class="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-gray-800 items-center">
        <button
          onClick={() => setActiveCategory("all")}
          class={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
            activeCategory === "all"
              ? "bg-[#e94560] text-white"
              : "bg-[#16213e] text-gray-400 hover:bg-[#1a4a7a]"
          }`}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            class={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? "bg-[#e94560] text-white"
                : "bg-[#16213e] text-gray-400 hover:bg-[#1a4a7a]"
            }`}
          >
            {cat.name}
          </button>
        ))}
        <button
          onClick={() => setShowCategoryManager(true)}
          class="px-3 py-1.5 rounded-full text-sm whitespace-nowrap bg-[#16213e] text-[#e94560] hover:bg-[#1a4a7a] transition-colors flex items-center gap-1"
        >
          <span>⚙️</span>
          <span>管理分类</span>
        </button>
      </div>

      {/* Manga Grid */}
      <div class="flex-1 overflow-y-auto p-4">
        {mangas.length === 0 ? (
          <div class="flex flex-col items-center justify-center h-full text-gray-400">
            <p>书架是空的</p>
            <button
              onClick={handleExplore}
              class="mt-4 px-6 py-2 bg-[#e94560] text-white rounded-lg"
            >
              去发现漫画
            </button>
          </div>
        ) : (
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {mangas.map((manga) => (
              <div
                key={manga.id}
                onClick={() => handleMangaClick(manga)}
                class="cursor-pointer group"
              >
                <div class="aspect-[2/3] rounded-lg overflow-hidden bg-[#16213e] relative">
                  <img
                    src={manga.cover}
                    alt={manga.title}
                    class="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  {manga.lastReadChapterId && (
                    <div class="absolute top-1 right-1 w-2 h-2 bg-[#e94560] rounded-full" />
                  )}
                </div>
                <p class="mt-1.5 text-sm text-white truncate">{manga.title}</p>
                <p class="text-xs text-gray-500 truncate">
                  {manga.author || "未知作者"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分类管理弹窗 */}
      {showCategoryManager && (
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="bg-[#16213e] rounded-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-white">分类管理</h2>
              <button
                onClick={() => setShowCategoryManager(false)}
                class="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* 新建分类 */}
            <div class="mb-4">
              <label class="block text-sm text-gray-400 mb-2">新建分类</label>
              <div class="flex gap-2">
                <Input
                  type="text"
                  placeholder="输入分类名称"
                  value={newCategoryName}
                  onChange={setNewCategoryName}
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={handleCreateCategory} variant="primary">
                  添加
                </Button>
              </div>
            </div>

            {/* 分类列表 */}
            <div>
              <label class="block text-sm text-gray-400 mb-2">已有分类</label>
              <div class="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    class="flex items-center gap-2 bg-[#1a1a2e] rounded-lg p-3"
                  >
                    {editingCategory?.id === cat.id ? (
                      <>
                        <Input
                          type="text"
                          value={editCategoryName}
                          onChange={setEditCategoryName}
                          className="flex-1"
                          autoFocus
                        />
                        <Button
                          onClick={handleEditCategory}
                          variant="primary"
                          size="sm"
                        >
                          保存
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingCategory(null);
                            setEditCategoryName("");
                          }}
                          variant="secondary"
                          size="sm"
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <span class="flex-1 text-white">{cat.name}</span>
                        {deleteConfirmId === cat.id ? (
                          <div class="flex items-center gap-1">
                            <span class="text-xs text-red-400">确定删除？</span>
                            <Button
                              onClick={() => handleDeleteCategory(cat.id)}
                              variant="primary"
                              size="sm"
                              className="bg-red-600 hover:bg-red-700"
                            >
                              删除
                            </Button>
                            <Button
                              onClick={() => setDeleteConfirmId(null)}
                              variant="secondary"
                              size="sm"
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => startEditCategory(cat)}
                              class="p-1 text-gray-400 hover:text-white"
                              title="编辑"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(cat.id)}
                              class="p-1 text-gray-400 hover:text-red-500"
                              title="删除"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <p class="text-sm text-gray-500 text-center py-4">暂无分类</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
