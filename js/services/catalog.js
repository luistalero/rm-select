import { supabase } from '../core/supabase.js';

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,slug,description,image_url,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

const PRODUCT_SELECT = `
  id,name,slug,description,base_price,compare_at_price,featured,created_at,
  categories(id,name,slug),
  product_images(id,url,alt_text,sort_order),
  product_variants(id,name,sku,price,attributes,is_active)
`;

export async function getFeaturedProducts(limit = 8) {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'ACTIVE')
    .eq('featured', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getProducts({ categorySlug = null, search = '', limit = 24 } = {}) {
  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (categorySlug) query = query.eq('categories.slug', categorySlug);
  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
