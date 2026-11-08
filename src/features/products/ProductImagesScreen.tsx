import { useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Screen, AppHeader, SectionCard, ErrorView } from 'src/components/shared';
import { Text, Icon, Pressable, Button, Chip, TextField, SegmentedControl, Skeleton, Spinner } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { extractApiError } from 'src/services/error';
import {
  analyzeProductImage,
  frameProductImage,
  generateProductImage,
  getProductImageCatalog,
  getProductImages,
  saveProductImages,
  uploadProductImage,
  type ImageAnalysis,
  type ImageResult,
} from 'src/api/productImages';
import { imagePickerQuality, pickedImage, prepareAttachment } from 'src/features/chat/attachment-prepare';

import {
  MAX_PRODUCT_IMAGES,
  append,
  defaultPreset,
  makePrimary,
  move,
  remove,
  sameOrder,
  toggleTag,
} from './product-images';

// ----------------------------------------------------------------------
// Ảnh sản phẩm trên app (bán online): bộ ảnh (ảnh đầu = ảnh chính; đổi thứ tự, xoá), chụp / chọn ảnh (vẽ lại bỏ
// EXIF/GPS rồi PUT thẳng lên R2), tạo ảnh từ ảnh nguồn: "Giữ nguyên" ghép nền (không AI, mặc định) hoặc "AI tạo ảnh"
// 1–3 ảnh theo gợi ý hợp đúng món (đồ nhạy cảm → manocanh) + tag; so sánh trước/sau, tích ảnh rồi thêm vào bộ, Lưu.
// ----------------------------------------------------------------------

type Mode = 'keep' | 'ai';

export function ProductImagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['erp', 'product-images', id],
    queryFn: () => getProductImages(id!),
    enabled: !!id,
  });
  const { data: catalog } = useQuery({
    queryKey: ['erp', 'product-image-catalog', id],
    queryFn: () => getProductImageCatalog(id!),
    enabled: !!id,
    staleTime: 3_600_000,
  });

  const [gallery, setGallery] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('keep');
  const [background, setBackground] = useState('white');
  const [analyses, setAnalyses] = useState<Record<string, ImageAnalysis>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [count, setCount] = useState(2);
  const [running, setRunning] = useState(0);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [viewing, setViewing] = useState<ImageResult | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loaded = useRef(false);
  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setGallery(data.images);
    setDescription(data.onlineDescription ?? '');
    setSource(data.images[0] ?? null);
  }, [data]);

  const analysis = source ? analyses[source] ?? null : null;

  async function analyze(url = source) {
    if (!url) return;
    setAnalyzing(true);
    try {
      const result = await analyzeProductImage(id!, url);
      setAnalyses((prev) => ({ ...prev, [url]: result }));
      setPreset(defaultPreset(result.presets));
      setTags([]);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    if (mode !== 'ai' || !source) return;
    const known = analyses[source];
    if (known) setPreset(defaultPreset(known.presets));
    else if (!analyzing) analyze(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, source]);

  async function addPhotos(fromCamera: boolean) {
    if (gallery.length >= MAX_PRODUCT_IMAGES) {
      toast.info(t('erp.images.full', { n: MAX_PRODUCT_IMAGES }));
      return;
    }
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(t(fromCamera ? 'erp.images.cameraPermission' : 'erp.images.photoPermission'));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: imagePickerQuality(0.85),
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      exif: false,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({
          ...options,
          allowsMultipleSelection: true,
          selectionLimit: MAX_PRODUCT_IMAGES - gallery.length,
        });
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    const added: string[] = [];
    try {
      // Tuần tự: mỗi ảnh giải mã tốn nhiều RAM.
      for (const asset of result.assets) {
        const prepared = await prepareAttachment(pickedImage(asset));
        added.push(await uploadProductImage(id!, { uri: prepared.uri, name: prepared.name, contentType: prepared.contentType }));
      }
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setUploading(false);
    }
    if (added.length === 0) return;
    const next = append(gallery, added);
    setGallery(next.urls);
    setSource(added[0]!);
  }

  async function run() {
    if (!source) return;
    if (mode === 'ai' && !preset) {
      toast.info(t('erp.images.pickStyle'));
      return;
    }
    const n = mode === 'ai' ? count : 1;
    setRunning(n);
    const jobs = Array.from({ length: n }, () =>
      (mode === 'keep'
        ? frameProductImage(id!, { sourceUrl: source, background, aspect: 'square' })
        : generateProductImage(id!, { sourceUrl: source, preset: preset!, tags: tags.length ? tags : undefined, note: note.trim() || undefined })
      ).then((r) => {
        setResults((prev) => [r, ...prev]);
        setViewing(r);
        setPicked((prev) => [...prev, r.url]);
        return r;
      })
    );
    const settled = await Promise.allSettled(jobs);
    setRunning(0);
    const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (failed) toast.error(extractApiError(failed.reason));
  }

  function addPicked() {
    const toAdd = results.map((r) => r.url).filter((u) => picked.includes(u) && !gallery.includes(u)).reverse();
    const next = append(gallery, toAdd);
    setGallery(next.urls);
    setPicked([]);
    toast.success(t('erp.images.added', { n: toAdd.length - next.dropped }));
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      await saveProductImages(id!, {
        urls: sameOrder(gallery, data.images) ? undefined : gallery,
        onlineDescription: description.trim(),
      });
      qc.invalidateQueries({ queryKey: ['erp', 'product'] });
      qc.invalidateQueries({ queryKey: ['erp', 'products'] });
      qc.invalidateQueries({ queryKey: ['erp', 'product-images', id] });
      toast.success(t('erp.images.saved'));
      router.back();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const dirty = !!data && (!sameOrder(gallery, data.images) || description.trim() !== (data.onlineDescription ?? '').trim());

  function leave() {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(t('erp.images.discardTitle'), t('erp.images.discardBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('erp.images.discard'), style: 'destructive', onPress: () => router.back() },
    ]);
  }

  if (isLoading) {
    return (
      <Screen scroll tabBarInset={false}>
        <AppHeader back title={t('erp.images.title')} />
        <Skeleton width="100%" height={140} radius={20} />
      </Screen>
    );
  }
  if (isError || !data) {
    return (
      <Screen tabBarInset={false}>
        <AppHeader back title={t('erp.images.title')} />
        <ErrorView onRetry={refetch} />
      </Screen>
    );
  }

  const busy = running > 0 || uploading || saving;
  const pickedNew = picked.filter((u) => !gallery.includes(u));

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader back onBack={leave} title={t('erp.images.title')} subtitle={data.name} />

      {data.kiotVietLinked ? (
        <Text variant="caption" tone="muted">
          {t(data.imagesCustomized ? 'erp.images.customized' : 'erp.images.fromKiotViet')}
        </Text>
      ) : null}

      {/* ---------- Bộ ảnh ---------- */}
      <SectionCard title={t('erp.images.gallery', { n: gallery.length, max: MAX_PRODUCT_IMAGES })} icon="image-multiple-outline">
        <Text variant="caption" tone="muted">{t('erp.images.galleryHint')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 8 }}>
          {gallery.map((url, index) => (
            <View key={url} style={{ width: 104 }} className="gap-1">
              <Pressable
                onPress={() => setSource(url)}
                accessibilityLabel={t('erp.images.useAsSource')}
                className={`rounded-xl overflow-hidden ${url === source ? 'border-[3px] border-primary' : 'border border-line dark:border-line-dark'}`}
              >
                <Image source={{ uri: url }} style={{ width: 98, height: 98 }} resizeMode="cover" />
                {index === 0 ? (
                  <View className="absolute left-1 top-1 rounded-md bg-primary px-1.5">
                    <Text variant="caption" className="text-white font-bold">{t('erp.images.primary')}</Text>
                  </View>
                ) : null}
              </Pressable>
              <View className="flex-row justify-between">
                <TileButton icon="star-outline" label={t('erp.images.makePrimary')} disabled={busy || index === 0} onPress={() => setGallery((g) => makePrimary(g, url))} />
                <TileButton icon="chevron-left" label={t('erp.images.moveBack')} disabled={busy || index === 0} onPress={() => setGallery((g) => move(g, url, -1))} />
                <TileButton icon="chevron-right" label={t('erp.images.moveForward')} disabled={busy || index === gallery.length - 1} onPress={() => setGallery((g) => move(g, url, 1))} />
                <TileButton
                  icon="trash-can-outline"
                  label={t('erp.images.remove')}
                  disabled={busy}
                  onPress={() => {
                    setGallery((g) => remove(g, url));
                    if (source === url) setSource(gallery.find((u) => u !== url) ?? null);
                  }}
                />
              </View>
            </View>
          ))}
        </ScrollView>
        <View className="flex-row gap-2">
          <Button variant="soft" size="sm" icon="camera-outline" loading={uploading} disabled={busy} onPress={() => addPhotos(true)}>
            {t('erp.images.camera')}
          </Button>
          <Button variant="soft" size="sm" icon="image-plus" disabled={busy} onPress={() => addPhotos(false)}>
            {t('erp.images.library')}
          </Button>
        </View>
      </SectionCard>

      {/* ---------- Tạo ảnh mới ---------- */}
      <SectionCard title={t('erp.images.create')} icon="auto-fix">
        {!source ? (
          <Text variant="bodySmall" tone="muted">{t('erp.images.noSource')}</Text>
        ) : (
          <View className="gap-3">
            <SegmentedControl
              segments={[
                { key: 'keep', label: t('erp.images.keep') },
                { key: 'ai', label: t('erp.images.ai') },
              ]}
              value={mode}
              onChange={(k) => !busy && setMode(k as Mode)}
            />

            {mode === 'keep' ? (
              <View className="gap-2">
                <Text variant="caption" tone="muted">{t('erp.images.keepHint')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(catalog?.backgrounds ?? []).map((b) => (
                    <Pressable
                      key={b.id}
                      onPress={() => setBackground(b.id)}
                      accessibilityLabel={b.label}
                      style={{ backgroundColor: b.color, width: 36, height: 36, borderRadius: 18, borderWidth: background === b.id ? 3 : 1 }}
                      className={background === b.id ? 'border-primary' : 'border-line dark:border-line-dark'}
                    />
                  ))}
                </View>
              </View>
            ) : analyzing && !analysis ? (
              <View className="flex-row items-center gap-2 py-2">
                <Spinner />
                <Text variant="bodySmall" tone="muted">{t('erp.images.analyzing')}</Text>
              </View>
            ) : !analysis ? (
              <Button variant="outline" icon="eye-outline" onPress={() => analyze()}>{t('erp.images.analyze')}</Button>
            ) : (
              <View className="gap-3">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Chip label={analysis.category} color="info" icon="tag-outline" />
                  {analysis.sensitive ? <Chip label={t('erp.images.sensitive')} color="warning" /> : null}
                  <Pressable onPress={() => analyze()} disabled={busy || analyzing}>
                    <Text variant="caption" tone="primary">{analyzing ? t('erp.images.analyzingShort') : t('erp.images.reanalyze')}</Text>
                  </Pressable>
                </View>
                {analysis.fallback ? <Text variant="caption" tone="muted">{t('erp.images.fallback')}</Text> : null}
                {(['studio', 'lifestyle'] as const).map((g) => {
                  const items = analysis.presets.filter((p) => p.group === g);
                  if (items.length === 0) return null;
                  return (
                    <View key={g} className="gap-1.5">
                      <Text variant="bodySmall" className="font-semibold">{t(g === 'studio' ? 'erp.images.studio' : 'erp.images.lifestyle')}</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {items.map((p) => (
                          <Chip key={p.id} label={p.label} color="primary" variant="outlined" selected={preset === p.id} onPress={() => setPreset(p.id)} />
                        ))}
                      </View>
                    </View>
                  );
                })}
                {analysis.tags.length > 0 ? (
                  <View className="gap-1.5">
                    <Text variant="bodySmall" className="font-semibold">{t('erp.images.tags')}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {analysis.tags.map((tag) => (
                        <Chip
                          key={tag.id}
                          size="sm"
                          label={tag.label}
                          color="secondary"
                          variant="outlined"
                          selected={tags.includes(tag.id)}
                          onPress={() => setTags((cur) => toggleTag(cur, tag.id))}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
                <TextField
                  label={t('erp.images.note')}
                  placeholder={t('erp.images.notePlaceholder')}
                  value={note}
                  onChangeText={setNote}
                  maxLength={catalog?.maxNoteLength ?? 200}
                />
                <View className="flex-row items-center gap-3">
                  <Text variant="bodySmall">{t('erp.images.count')}</Text>
                  {[1, 2, 3].map((n) => (
                    <Chip key={n} label={String(n)} color="primary" variant="outlined" selected={count === n} onPress={() => setCount(n)} />
                  ))}
                </View>
              </View>
            )}

            <Button
              icon={mode === 'ai' ? 'auto-fix' : 'image-filter-center-focus'}
              loading={running > 0}
              disabled={uploading || saving || (mode === 'ai' && (analyzing || !analysis))}
              onPress={run}
            >
              {mode === 'ai' ? t('erp.images.generate', { n: count }) : t('erp.images.frame')}
            </Button>

            <View className="flex-row gap-3">
              <Figure title={t('erp.images.before')} uri={source} />
              <Figure title={viewing ? viewing.label : t('erp.images.after')} uri={viewing?.url ?? null} loading={running > 0} />
            </View>
            {viewing && viewing.style !== 'frame' ? <Text variant="caption" tone="warning">{t('erp.images.aiWarning')}</Text> : null}

            {results.length > 0 ? (
              <View className="gap-2">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {results.map((r) => {
                    const inGallery = gallery.includes(r.url);
                    const on = inGallery || picked.includes(r.url);
                    return (
                      <Pressable
                        key={r.url}
                        onPress={() => setViewing(r)}
                        onLongPress={() => !inGallery && setPicked((p) => (p.includes(r.url) ? p.filter((u) => u !== r.url) : [...p, r.url]))}
                        accessibilityLabel={r.label}
                        className={`rounded-lg overflow-hidden ${viewing?.url === r.url ? 'border-2 border-primary' : ''}`}
                      >
                        <Image source={{ uri: r.url }} style={{ width: 80, height: 80 }} />
                        <Pressable
                          onPress={() => !inGallery && setPicked((p) => (p.includes(r.url) ? p.filter((u) => u !== r.url) : [...p, r.url]))}
                          hitSlop={8}
                          className={`absolute right-1 top-1 w-6 h-6 rounded-full items-center justify-center ${on ? 'bg-primary' : 'bg-white/90'}`}
                        >
                          {on ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Button variant="outline" size="sm" icon="plus" disabled={busy || pickedNew.length === 0} onPress={addPicked}>
                  {t('erp.images.addPicked', { n: pickedNew.length })}
                </Button>
              </View>
            ) : null}
          </View>
        )}
      </SectionCard>

      {/* ---------- Mô tả bán online ---------- */}
      <SectionCard title={t('erp.images.description')} icon="text">
        <TextField
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder={data.description ?? t('erp.images.descriptionPlaceholder')}
          maxLength={4000}
          style={{ minHeight: 90 }}
        />
        <Text variant="caption" tone="muted">{t('erp.images.descriptionHint')}</Text>
      </SectionCard>

      <Button icon="content-save-outline" loading={saving} disabled={!dirty || running > 0 || uploading} onPress={save}>
        {t('erp.images.save')}
      </Button>
    </Screen>
  );
}

function TileButton({ icon, label, disabled, onPress }: { icon: any; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4} accessibilityLabel={label} className={`p-1 ${disabled ? 'opacity-30' : ''}`}>
      <Icon name={icon} size={16} tone="muted" />
    </Pressable>
  );
}

function Figure({ title, uri, loading }: { title: string; uri: string | null; loading?: boolean }) {
  return (
    <View className="flex-1 gap-1">
      <Text variant="caption" tone="muted" numberOfLines={1}>{title}</Text>
      <View className="aspect-square rounded-xl overflow-hidden bg-ink/5 dark:bg-white/10 items-center justify-center">
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
        {loading ? (
          <View className="absolute inset-0 items-center justify-center bg-white/60">
            <Spinner />
          </View>
        ) : null}
        {!uri && !loading ? <Text variant="caption" tone="muted">—</Text> : null}
      </View>
    </View>
  );
}
