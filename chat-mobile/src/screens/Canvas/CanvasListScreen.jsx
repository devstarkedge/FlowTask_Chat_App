import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  Platform,
  Animated,
  useWindowDimensions,
  Switch,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenContainer from '../../components/common/ScreenContainer';
import AppScreen from '../../components/common/AppScreen';
import KeyboardAwareContainer from '../../components/common/KeyboardAwareContainer';
import {
  Plus,
  Search,
  FileText,
  ArrowLeft,
  X,
  ChevronRight,
  Sparkles,
  Layers,
  ChevronLeft,
  Image as ImageIcon,
  Copy,
  Clock,
  Link as LinkIcon,
  Upload,
  Camera,
} from 'lucide-react-native';
import { useCanvasStore } from '../../stores/canvasStore';
import { useThemeStore } from '../../stores/themeStore';
import CanvasCard from '../../components/canvas/CanvasCard';
import { CATEGORIES, TEMPLATES, buildTemplateContent } from '../../utils/templates';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { fileAPI } from '../../services/api';
import ENV from '../../config/environment';



export default function CanvasListScreen({ route, navigation }) {
  const { channelId, channelName } = route.params || {};
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Create Canvas Modal States
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [modalStep, setModalStep] = useState('choice'); // 'choice' | 'templates_list' | 'customize' | 'existing_list'
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Customization States
  const [newCanvasTitle, setNewCanvasTitle] = useState('');
  const [selectedCoverIndex, setSelectedCoverIndex] = useState(0);
  const [variableValues, setVariableValues] = useState({});
  const [prefillVars, setPrefillVars] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [customCover, setCustomCover] = useState(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Rename Modal States
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [canvasToRename, setCanvasToRename] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Gallery access is required to upload a cover.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      uploadCoverFile(result.assets[0]);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Camera access is required to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      uploadCoverFile(result.assets[0]);
    }
  };

  const uploadCoverFile = async (asset) => {
    setIsUploadingCover(true);
    const formData = new FormData();
    formData.append('files', {
      uri: asset.uri,
      name: asset.fileName || 'cover.jpg',
      type: asset.mimeType || 'image/jpeg',
    });

    try {
      const uploadRes = await fileAPI.uploadFiles(channelId, formData, undefined, true);
      let uploadedUrl = uploadRes.data?.data?.files?.[0]?.secureUrl || 
                        uploadRes.data?.data?.files?.[0]?.url || 
                        uploadRes.data?.data?.urls?.[0] || 
                        uploadRes.data?.url || 
                        uploadRes.data?.data?.[0]?.url;

      if (uploadedUrl && !uploadedUrl.startsWith('http')) {
        const prefix = ENV.SOCKET_URL || 'https://chat-app-api-cyyl.onrender.com';
        uploadedUrl = uploadedUrl.startsWith('/') ? prefix + uploadedUrl : prefix + '/' + uploadedUrl;
      }

      if (uploadedUrl) {
        setCustomCover({ type: 'image', value: uploadedUrl });
        Toast.show({
          type: 'success',
          text1: 'Cover uploaded successfully!',
        });
      } else {
        Alert.alert('Upload Failed', 'Failed to retrieve media URL.');
      }
    } catch (err) {
      Alert.alert('Upload Error', 'Error uploading image to server.');
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Existing Canvases List States
  const [existingSearch, setExistingSearch] = useState('');
  const [existingCanvases, setExistingCanvases] = useState([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);

  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const { colors } = useThemeStore();

  const {
    canvasesByChannel,
    savedCanvasIds,
    isLoading,
    fetchChannelCanvases,
    createCanvas,
    updateCanvas,
    toggleSaveForLater,
    deleteCanvas,
    duplicateCanvas,
    loadCanvas,
    templates,
    fetchTemplates,
  } = useCanvasStore();

  const canvases = canvasesByChannel[channelId] || [];

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (channelId) {
      fetchChannelCanvases(channelId);
    }
  }, [channelId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchChannelCanvases(channelId);
    setIsRefreshing(false);
  };

  // ── Create Modal Actions ──────────────────────────────────────────────────
  const openCreateModal = useCallback(() => {
    setSelectedTemplate(null);
    setModalStep('choice');
    setTemplateSearch('');
    setSelectedCategory('All');
    setNewCanvasTitle('');
    setSelectedCoverIndex(0);
    setCustomCover(null);
    setVariableValues({});
    setPrefillVars(false);
    setExistingSearch('');
    setCreateModalVisible(true);
    
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  const closeCreateModal = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCreateModalVisible(false);
    });
  }, [slideAnim]);

  const handleCreateBlank = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const newCanvas = await createCanvas(channelId, {
        title: "Untitled canvas",
        content: { type: "doc", content: [{ type: "paragraph" }] },
      });
      closeCreateModal();
      if (newCanvas?._id) {
        navigation.navigate('CanvasEditor', {
          canvasId: newCanvas._id,
          channelId,
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to create blank canvas.');
    } finally {
      setIsCreating(false);
    }
  }, [channelId, createCanvas, isCreating, closeCreateModal, navigation]);

  const handleSelectTemplate = useCallback((template) => {
    setSelectedTemplate(template);
    setNewCanvasTitle(template.label);
    setSelectedCoverIndex(0);
    
    // Init variables
    const vars = {};
    (template.variables || []).forEach((v) => {
      vars[v.name] = '';
    });
    setVariableValues(vars);
    setPrefillVars(false);
    
    setModalStep('customize');
  }, []);

  const handleLoadExistingList = useCallback(async () => {
    setIsLoadingExisting(true);
    setModalStep('existing_list');
    try {
      // In a real flow we can fetch all channels canvases or general ones
      await fetchChannelCanvases(channelId);
      const list = canvasesByChannel[channelId] || [];
      setExistingCanvases(list);
    } catch (err) {
      console.warn("Failed to load existing canvases list:", err);
    } finally {
      setIsLoadingExisting(false);
    }
  }, [channelId, fetchChannelCanvases, canvasesByChannel]);

  const handleSelectExistingCanvas = useCallback(async (canvas) => {
    try {
      await loadCanvas(canvas._id);
      closeCreateModal();
      navigation.navigate('CanvasEditor', {
        canvasId: canvas._id,
        channelId,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to load selected canvas.');
    }
  }, [loadCanvas, closeCreateModal, navigation, channelId]);

  const handleTogglePrefill = useCallback((checked) => {
    setPrefillVars(checked);
    if (!selectedTemplate) return;
    const next = { ...variableValues };
    (selectedTemplate.variables || []).forEach((v) => {
      next[v.name] = checked ? v.example || '' : '';
    });
    setVariableValues(next);
  }, [selectedTemplate, variableValues]);

  const handleCreateCanvas = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);

    const template = selectedTemplate;
    const title = newCanvasTitle.trim() || template.label || 'Untitled Canvas';

    // Map template to valid Mongoose canvas schema type enum
    const mapTemplateToType = (tplId) => {
      const meetingIds = ['meeting_notes', 'weekly_sync', 'agenda', 'weekly_1_1', 'meeting'];
      const brainstormIds = ['brainstorm', 'monthly_newsletter'];
      const projectIds = ['sprint_planning', 'technical_specifications', 'todo_list', 'product_brief', 'out_of_office', 'company_handbook', 'sales_enablement_hub', 'sprint', 'docs', 'okr', 'retro'];
      
      if (meetingIds.includes(tplId)) return 'meeting';
      if (brainstormIds.includes(tplId)) return 'brainstorm';
      if (projectIds.includes(tplId)) return 'project';
      return 'notes';
    };

    // 1. Build template content
    let content = buildTemplateContent(template);

    // 2. Replace variables in content JSON if any
    if (template.variables && template.variables.length > 0) {
      const vars = prefillVars ? variableValues : variableValues;
      const applyVariablesToDoc = (doc, vValues) => {
        if (!vValues || Object.keys(vValues).length === 0) return doc;
        
        const replaceText = (text) => {
          if (!text || typeof text !== 'string') return text;
          let out = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, p1) => (vValues[p1] != null && vValues[p1] !== '' ? vValues[p1] : m));
          out = out.replace(/\[([^\]]+)\]/g, (m, p1) => (vValues[p1] != null && vValues[p1] !== '' ? vValues[p1] : m));
          return out;
        };

        const walk = (node) => {
          if (!node) return node;
          if (node.type === 'text' && typeof node.text === 'string') {
            return { ...node, text: replaceText(node.text) };
          }
          if (node.content && Array.isArray(node.content)) {
            return { ...node, content: node.content.map(walk) };
          }
          return node;
        };

        return { ...doc, content: (doc.content || []).map(walk) };
      };

      content = applyVariablesToDoc(content, vars);
    }

    // 3. Cover configuration
    let canvasCover = null;
    if (customCover) {
      canvasCover = customCover;
    } else if (template.cover) {
      const variations = Array.isArray(template.cover) 
        ? template.cover 
        : (template.cover.variations || [template.cover]);
      
      const variation = variations[selectedCoverIndex] || variations[0];
      if (variation) {
        if (variation.url) {
          canvasCover = { type: 'image', value: variation.url };
        } else if (variation.colorPalette) {
          const p = variation.colorPalette;
          const a = p[0] || '#eef2ff';
          const b = p[1] || a;
          canvasCover = { type: 'gradient', value: `linear-gradient(135deg, ${a}, ${b})` };
        }
      }
    }

    const payload = {
      title,
      type: mapTemplateToType(template.id),
      content,
    };

    if (canvasCover) {
      payload.cover = canvasCover;
    }

    try {
      const newCanvas = await createCanvas(channelId, payload);
      closeCreateModal();
      if (newCanvas?._id) {
        navigation.navigate('CanvasEditor', {
          canvasId: newCanvas._id,
          channelId,
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to create canvas. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, selectedTemplate, newCanvasTitle, selectedCoverIndex, customCover, variableValues, prefillVars, channelId, createCanvas, closeCreateModal, navigation]);

  const handleSelect = (canvas) => {
    navigation.navigate('CanvasEditor', {
      canvasId: canvas._id,
      channelId,
    });
  };

  const handleRenamePress = (canvas) => {
    setCanvasToRename(canvas);
    setRenameTitle(canvas.title || '');
    setRenameModalVisible(true);
  };

  const submitRenameCanvas = async () => {
    if (!canvasToRename || !renameTitle.trim()) return;
    try {
      await updateCanvas(canvasToRename._id, { title: renameTitle.trim() });
      setRenameModalVisible(false);
      fetchChannelCanvases(channelId);
    } catch (err) {
      Alert.alert('Error', 'Failed to rename canvas.');
    }
  };

  const handleCardOptions = (canvas) => {
    Alert.alert(
      canvas.title || 'Canvas Options',
      'Select an action:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: () => handleRenamePress(canvas),
        },
        {
          text: 'Duplicate',
          onPress: async () => {
            const dup = await duplicateCanvas(canvas._id);
            if (dup) {
              Alert.alert('Success', 'Canvas duplicated successfully.');
              fetchChannelCanvases(channelId);
            }
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Canvas',
              'Are you sure you want to delete this canvas? This action cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteCanvas(canvas._id),
                },
              ]
            );
          },
        },
      ]
    );
  };

  // Filter primary canvases list
  const filteredCanvases = canvases.filter((c) =>
    (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter templates list in modal (fallback to local TEMPLATES if store is empty)
  const availableCategories = useMemo(() => {
    const list = (templates && templates.length > 0) ? templates : TEMPLATES;
    const cats = new Set(['All']);
    list.forEach((t) => {
      if (t.category) {
        cats.add(t.category);
      }
    });
    return Array.from(cats);
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    const listToFilter = (templates && templates.length > 0) ? templates : TEMPLATES;
    return listToFilter.filter((t) => {
      const matchesSearch =
        (t.label || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        ((t.tags || []).join(' ') || '').toLowerCase().includes(q);
      const matchesCategory =
        selectedCategory === 'All' ||
        (t.category || '').toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [templates, templateSearch, selectedCategory]);

  // Filter existing canvases list in modal
  const filteredExisting = useMemo(() => {
    const q = existingSearch.trim().toLowerCase();
    return existingCanvases.filter((c) =>
      (c.title || 'Untitled canvas').toLowerCase().includes(q)
    );
  }, [existingSearch, existingCanvases]);

  // ── Template List Render Item ──────────────────────────────────────────────
  const renderTemplateRow = ({ item: template }) => {
    const IconComponent = template.icon || FileText;
    return (
      <TouchableOpacity
        style={[styles.templateRow, { backgroundColor: colors.background, borderColor: colors.border }]}
        onPress={() => handleSelectTemplate(template)}
        activeOpacity={0.7}
      >
        <View style={[styles.templateRowIconWrap, { backgroundColor: template.iconBg || 'rgba(107,114,128,0.08)' }]}>
          <IconComponent size={20} color={template.iconColor || colors.textSecondary} />
        </View>
        <View style={styles.templateRowText}>
          <Text style={[styles.templateRowLabel, { color: colors.textPrimary }]}>{template.label}</Text>
          <Text style={[styles.templateRowDesc, { color: colors.textTertiary }]} numberOfLines={1}>
            {template.subtitle || template.description}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <AppScreen edges={['top', 'left', 'right']} style={styles.container}>
      <ScreenContainer style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Canvas Documents</Text>
          </View>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.primary }]} onPress={openCreateModal}>
            <Plus size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

      {/* Search Primary Canvases */}
      <View style={[styles.searchBarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Search size={18} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search canvas..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Canvases List */}
      {isLoading && canvases.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredCanvases.length === 0 ? (
        <View style={styles.empty}>
          <FileText size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No canvases found</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {searchQuery ? 'Try adjusting your search filter' : 'Create a canvas to get started!'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={[styles.emptyCreateBtn, { backgroundColor: colors.primary }]}
              onPress={openCreateModal}
            >
              <Plus size={16} color="#ffffff" />
              <Text style={styles.emptyCreateBtnText}>New Canvas</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredCanvases}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          renderItem={({ item }) => (
            <CanvasCard
              canvas={item}
              isSaved={savedCanvasIds.has(item._id)}
              onSelect={handleSelect}
              onSaveToggle={toggleSaveForLater}
              onOptionsPress={handleCardOptions}
            />
          )}
        />
      )}

      {/* Rename Canvas Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setRenameModalVisible(false)} activeOpacity={1} />
          <View style={[styles.renameDialogContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.renameDialogTitle, { color: colors.textPrimary }]}>Rename Canvas</Text>
            <TextInput
              style={[styles.renameDialogInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
              value={renameTitle}
              onChangeText={setRenameTitle}
              autoFocus
              selectTextOnFocus
              maxLength={80}
            />
            <View style={styles.renameDialogButtons}>
              <TouchableOpacity onPress={() => setRenameModalVisible(false)} style={styles.renameDialogBtn}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitRenameCanvas} style={[styles.renameDialogBtn, { backgroundColor: colors.primary, borderRadius: 6 }]}>
                <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CREATE CANVAS & TEMPLATE SELECTOR MODAL ───────────────────────── */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="none"
        onRequestClose={closeCreateModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={closeCreateModal} activeOpacity={1} />
          <Animated.View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.card,
                transform: [{ translateY: slideAnim }],
                maxHeight: screenHeight * 0.92,
                height: screenHeight * 0.85,
              },
            ]}
          >
            <KeyboardAwareContainer disablePadding style={styles.modalBody}>
              {/* Modal Drag Handle */}
              <View style={styles.modalDragHandle} />

              {/* ── STEP 1: CHOICE INTENT SELECTOR (Blank / Template / Link) ── */}
              {modalStep === 'choice' && (
                <View style={{ flex: 1, padding: moderateScale(20) }}>
                  <View style={styles.modalChoiceHeader}>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Create canvas</Text>
                    <TouchableOpacity onPress={closeCreateModal} style={styles.modalCloseBtn}>
                      <X size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.choiceOptionsList}>
                    {/* Option 1: Blank Canvas */}
                    <TouchableOpacity
                      style={[styles.choiceCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={handleCreateBlank}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.choiceIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                        <Plus size={22} color={colors.primary} />
                      </View>
                      <View style={styles.choiceTextWrap}>
                        <Text style={[styles.choiceLabel, { color: colors.textPrimary }]}>Blank canvas</Text>
                        <Text style={[styles.choiceDesc, { color: colors.textTertiary }]}>Start with a blank document</Text>
                      </View>
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {/* Option 2: From Template */}
                    <TouchableOpacity
                      style={[styles.choiceCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => setModalStep('templates_list')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.choiceIconWrap, { backgroundColor: 'rgba(124, 58, 237, 0.1)' }]}>
                        <Copy size={20} color="#7c3aed" />
                      </View>
                      <View style={styles.choiceTextWrap}>
                        <Text style={[styles.choiceLabel, { color: colors.textPrimary }]}>From template</Text>
                        <Text style={[styles.choiceDesc, { color: colors.textTertiary }]}>Use a predefined template</Text>
                      </View>
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {/* Option 3: Link Existing */}
                    <TouchableOpacity
                      style={[styles.choiceCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={handleLoadExistingList}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.choiceIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                        <LinkIcon size={20} color="#10b981" />
                      </View>
                      <View style={styles.choiceTextWrap}>
                        <Text style={[styles.choiceLabel, { color: colors.textPrimary }]}>Link existing</Text>
                        <Text style={[styles.choiceDesc, { color: colors.textTertiary }]}>Link a canvas from this workspace</Text>
                      </View>
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.choiceFooterText, { color: colors.textTertiary }]}>
                    Changes sync in real-time with other collaborators.
                  </Text>
                </View>
              )}

              {/* ── STEP 2: TEMPLATE LIST VIEW ──────────────────────────────── */}
              {modalStep === 'templates_list' && (
                <View style={{ flex: 1 }}>
                  <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setModalStep('choice')} style={styles.modalBackIconBtn}>
                      <ChevronLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary, flex: 1, marginLeft: scale(8) }]}>
                      From template
                    </Text>
                    <TouchableOpacity onPress={closeCreateModal} style={styles.modalCloseBtn}>
                      <X size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Template Search Bar */}
                  <View style={[styles.modalSearchContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Search size={16} color={colors.textTertiary} style={styles.searchIcon} />
                    <TextInput
                      style={[styles.modalSearchInput, { color: colors.textPrimary }]}
                      placeholder="Search templates..."
                      placeholderTextColor={colors.textTertiary}
                      value={templateSearch}
                      onChangeText={setTemplateSearch}
                      clearButtonMode="while-editing"
                    />
                  </View>

                  {/* Category Scroll tabs */}
                  <View style={{ height: verticalScale(44), marginVertical: verticalScale(4) }}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.categoryScroll}
                    >
                      {availableCategories.map((cat) => {
                        const isSelected = selectedCategory === cat;
                        return (
                          <TouchableOpacity
                            key={cat}
                            onPress={() => setSelectedCategory(cat)}
                            style={[
                              styles.categoryTab,
                              {
                                backgroundColor: isSelected ? colors.primary : colors.background,
                                borderColor: isSelected ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <Text style={[styles.categoryTabText, { color: isSelected ? '#ffffff' : colors.textSecondary }]}>
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Templates flat list */}
                  <FlatList
                    data={filteredTemplates}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTemplateRow}
                    contentContainerStyle={styles.templateListScroll}
                    showsVerticalScrollIndicator={false}
                  />
                </View>
              )}

              {/* ── STEP 3: CUSTOMIZE VIEW ──────────────────────────────────── */}
              {modalStep === 'customize' && selectedTemplate && (
                <View style={styles.customizeStepContainer}>
                  <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setModalStep('templates_list')} style={styles.modalBackIconBtn}>
                      <ChevronLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary, flex: 1, marginLeft: scale(8) }]}>
                      Configure Template
                    </Text>
                    <TouchableOpacity onPress={closeCreateModal} style={styles.modalCloseBtn}>
                      <X size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={styles.customizeScroll}
                    contentContainerStyle={styles.customizeScrollContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.customizeContainer}>
                      <View style={styles.selectedBadgeRow}>
                        <View style={[styles.templateRowIconWrap, { backgroundColor: selectedTemplate.iconBg }]}>
                          {React.createElement(selectedTemplate.icon || FileText, { size: 18, color: selectedTemplate.iconColor })}
                        </View>
                        <View style={{ marginLeft: scale(12), flex: 1 }}>
                          <Text style={[styles.selectedTemplateLabel, { color: colors.textPrimary }]}>{selectedTemplate.label}</Text>
                          <Text style={[styles.selectedTemplateCategory, { color: colors.textSecondary }]}>{selectedTemplate.category || 'General'}</Text>
                        </View>
                      </View>

                      {/* Canvas Title */}
                      <View style={styles.formGroup}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Canvas Title</Text>
                        <TextInput
                          style={[styles.customTitleInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                          value={newCanvasTitle}
                          onChangeText={setNewCanvasTitle}
                          placeholder="e.g. Project Specs"
                          placeholderTextColor={colors.textTertiary}
                        />
                      </View>

                      {/* Cover selection */}
                      <View style={styles.formGroup}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: verticalScale(4) }]}>Cover Image</Text>
                        
                        {/* Preview of current cover */}
                        <View style={[styles.coverPreviewContainer, { borderColor: colors.border }]}>
                          {isUploadingCover ? (
                            <View style={[styles.coverPreviewImage, { backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }]}>
                              <ActivityIndicator size="small" color={colors.primary} />
                              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>Uploading image...</Text>
                            </View>
                          ) : customCover ? (
                            customCover.type === 'image' ? (
                              <Image source={{ uri: customCover.value }} style={styles.coverPreviewImage} />
                            ) : (
                              <View style={[styles.coverPreviewImage, { backgroundColor: customCover.value }]} />
                            )
                          ) : selectedTemplate.cover ? (
                            (() => {
                              const variations = Array.isArray(selectedTemplate.cover) 
                                ? selectedTemplate.cover 
                                : (selectedTemplate.cover.variations || [selectedTemplate.cover]);
                              const variation = variations[selectedCoverIndex] || variations[0];
                              if (variation?.url) {
                                return <Image source={{ uri: variation.url }} style={styles.coverPreviewImage} />;
                              }
                              if (variation?.colorPalette) {
                                return <View style={[styles.coverPreviewImage, { backgroundColor: variation.colorPalette[0] }]} />;
                              }
                              return (
                                <View style={[styles.coverPreviewImage, { backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }]}>
                                  <ImageIcon size={32} color={colors.textTertiary} />
                                </View>
                              );
                            })()
                          ) : (
                            <View style={[styles.coverPreviewImage, { backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }]}>
                              <ImageIcon size={32} color={colors.textTertiary} />
                              <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>No Cover Selected</Text>
                            </View>
                          )}
                        </View>

                        {/* Upload Cover Buttons */}
                        <View style={{ flexDirection: 'row', gap: scale(8), marginTop: verticalScale(8) }}>
                          <TouchableOpacity 
                            onPress={handlePickImage} 
                            style={[styles.uploadOptionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                          >
                            <Upload size={16} color={colors.textSecondary} />
                            <Text style={[styles.uploadOptionText, { color: colors.textPrimary }]}>Choose Photo</Text>
                          </TouchableOpacity>

                          <TouchableOpacity 
                            onPress={handleTakePhoto} 
                            style={[styles.uploadOptionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                          >
                            <Camera size={16} color={colors.textSecondary} />
                            <Text style={[styles.uploadOptionText, { color: colors.textPrimary }]}>Take Photo</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Preset variations selector */}
                        {selectedTemplate.cover && (
                          <View style={{ marginTop: verticalScale(12) }}>
                            <Text style={[styles.inputLabel, { color: colors.textTertiary, fontSize: 12, marginBottom: verticalScale(4) }]}>Template Variations</Text>
                            <View style={styles.coverSelectorRow}>
                              {((Array.isArray(selectedTemplate.cover) ? selectedTemplate.cover : (selectedTemplate.cover.variations || [selectedTemplate.cover]))).map((cov, index) => {
                                const isSelected = !customCover && selectedCoverIndex === index;
                                const isGradient = cov.type === 'gradient';
                                return (
                                  <TouchableOpacity
                                    key={index}
                                    onPress={() => {
                                      setCustomCover(null);
                                      setSelectedCoverIndex(index);
                                    }}
                                    style={[
                                      styles.coverOptionBtn,
                                      {
                                        borderColor: isSelected ? colors.primary : colors.border,
                                        borderWidth: isSelected ? 2 : 1,
                                      },
                                    ]}
                                  >
                                    {isGradient ? (
                                      <View style={[styles.coverOptionPreview, { backgroundColor: cov.colorPalette?.[0] || '#4f46e5' }]}>
                                        <Text style={styles.coverOptionText}>Gradient</Text>
                                      </View>
                                    ) : (
                                      <View style={[styles.coverOptionPreview, { backgroundColor: '#f3f4f6' }]}>
                                        <ImageIcon size={14} color="#6b7280" />
                                        <Text style={[styles.coverOptionText, { color: '#4b5563' }]}>Preset</Text>
                                      </View>
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Variables Form */}
                      {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                        <View style={styles.formGroup}>
                          <View style={styles.prefillToggleRow}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: verticalScale(0) }]}>
                              Auto-Fill Variables
                            </Text>
                            <Switch
                              value={prefillVars}
                              onValueChange={handleTogglePrefill}
                              trackColor={{ false: '#767577', true: colors.primary + '80' }}
                              thumbColor={prefillVars ? colors.primary : '#f4f3f4'}
                            />
                          </View>
                          
                          <View style={styles.variablesInputsList}>
                            {selectedTemplate.variables.map((v) => (
                              <View key={v.name} style={styles.variableRow}>
                                <Text style={[styles.variableName, { color: colors.textSecondary }]}>
                                  {v.name.replace(/_/g, ' ')}
                                </Text>
                                <TextInput
                                  style={[styles.variableInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                                  value={variableValues[v.name] || ''}
                                  onChangeText={(val) => {
                                    setVariableValues((prev) => ({ ...prev, [v.name]: val }));
                                  }}
                                  placeholder={v.example || 'Value...'}
                                  placeholderTextColor={colors.textTertiary}
                                />
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  </ScrollView>

                  <View
                    style={[
                      styles.modalFooter,
                      {
                        borderTopColor: colors.border,
                        backgroundColor: colors.card,
                        paddingBottom: Math.max(insets.bottom, moderateScale(14)),
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.createCanvasBtn,
                        {
                          backgroundColor: isCreating ? colors.primary + '80' : colors.primary,
                        },
                      ]}
                      onPress={handleCreateCanvas}
                      disabled={isCreating}
                    >
                      {isCreating ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Sparkles size={18} color="#ffffff" />
                          <Text style={styles.createCanvasBtnText}>Create Document</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── STEP 4: LINK EXISTING CANVASES LIST ─────────────────────── */}
              {modalStep === 'existing_list' && (
                <View style={{ flex: 1 }}>
                  <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setModalStep('choice')} style={styles.modalBackIconBtn}>
                      <ChevronLeft size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary, flex: 1, marginLeft: scale(8) }]}>
                      Link existing canvas
                    </Text>
                    <TouchableOpacity onPress={closeCreateModal} style={styles.modalCloseBtn}>
                      <X size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Search Bar for Existing Canvases */}
                  <View style={[styles.modalSearchContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Search size={16} color={colors.textTertiary} style={styles.searchIcon} />
                    <TextInput
                      style={[styles.modalSearchInput, { color: colors.textPrimary }]}
                      placeholder="Search canvases..."
                      placeholderTextColor={colors.textTertiary}
                      value={existingSearch}
                      onChangeText={setExistingSearch}
                      clearButtonMode="while-editing"
                    />
                  </View>

                  {isLoadingExisting ? (
                    <View style={styles.centered}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : filteredExisting.length === 0 ? (
                    <View style={styles.empty}>
                      <FileText size={32} color={colors.border} />
                      <Text style={[styles.emptyTitle, { color: colors.textPrimary, fontSize: moderateScale(14) }]}>
                        No canvases found
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      data={filteredExisting}
                      keyExtractor={(item) => item._id}
                      contentContainerStyle={styles.templateListScroll}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[styles.templateRow, { backgroundColor: colors.background, borderColor: colors.border }]}
                          onPress={() => handleSelectExistingCanvas(item)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.templateRowIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.08)' }]}>
                            <FileText size={18} color={colors.primary} />
                          </View>
                          <View style={styles.templateRowText}>
                            <Text style={[styles.templateRowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                              {item.title || 'Untitled canvas'}
                            </Text>
                            {item.updatedAt && (
                              <View style={styles.timeInfoRow}>
                                <Clock size={10} color={colors.textTertiary} />
                                <Text style={[styles.timeText, { color: colors.textTertiary, marginLeft: scale(4) }]}>
                                  {new Date(item.updatedAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </Text>
                              </View>
                            )}
                          </View>
                          <ChevronRight size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>
              )}
            </KeyboardAwareContainer>
          </Animated.View>
        </View>
      </Modal>
      </ScreenContainer>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backBtn: {
    marginRight: moderateScale(12),
    paddingVertical: moderateScale(4),
    paddingHorizontal: moderateScale(2),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16),
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(12),
    borderBottomWidth: 1,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: '700',
  },
  subtitle: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(2),
  },
  createBtn: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: moderateScale(16),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    paddingHorizontal: moderateScale(12),
  },
  searchIcon: {
    marginRight: moderateScale(8),
  },
  searchInput: {
    flex: 1,
    height: moderateScale(40),
    fontSize: moderateScale(14),
  },
  list: {
    paddingHorizontal: moderateScale(16),
    paddingBottom: moderateScale(24),
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: moderateScale(32),
  },
  emptyTitle: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    marginTop: moderateScale(16),
  },
  emptySubtitle: {
    fontSize: moderateScale(14),
    textAlign: 'center',
    marginTop: moderateScale(8),
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(20),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(8),
    marginTop: moderateScale(20),
    gap: 6,
  },
  emptyCreateBtnText: {
    color: '#ffffff',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  // ── Modal Styles ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
  },
  modalDragHandle: {
    width: moderateScale(38),
    height: moderateScale(4),
    borderRadius: moderateScale(2),
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginTop: moderateScale(8),
    marginBottom: moderateScale(4),
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(20),
    paddingTop: moderateScale(8),
    paddingBottom: moderateScale(14),
    borderBottomWidth: 1,
  },
  modalChoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: moderateScale(20),
  },
  modalBackIconBtn: {
    padding: moderateScale(4),
    marginRight: moderateScale(4),
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: moderateScale(6),
  },
  // Choice Layout
  choiceOptionsList: {
    marginVertical: moderateScale(20),
    gap: 12,
    flex: 1,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(16),
    borderRadius: moderateScale(14),
    borderWidth: 1,
  },
  choiceIconWrap: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTextWrap: {
    flex: 1,
    marginLeft: moderateScale(16),
  },
  choiceLabel: {
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  choiceDesc: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(3),
  },
  choiceFooterText: {
    fontSize: moderateScale(11),
    textAlign: 'center',
    marginBottom: moderateScale(10),
  },
  // Template/Search Styles
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: moderateScale(20),
    marginTop: moderateScale(14),
    marginBottom: moderateScale(8),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    paddingHorizontal: moderateScale(10),
    minHeight: moderateScale(38),
  },
  modalSearchInput: {
    flex: 1,
    fontSize: moderateScale(13),
    paddingVertical: moderateScale(8),
  },
  categoryScroll: {
    paddingHorizontal: moderateScale(20),
    alignItems: 'center',
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(16),
    borderWidth: 1,
  },
  categoryTabText: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  templateListScroll: {
    paddingHorizontal: moderateScale(20),
    paddingTop: moderateScale(8),
    paddingBottom: moderateScale(32),
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(12),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    marginBottom: moderateScale(8),
  },
  templateRowIconWrap: {
    width: moderateScale(38),
    height: moderateScale(38),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateRowText: {
    flex: 1,
    marginLeft: moderateScale(12),
    marginRight: moderateScale(8),
  },
  templateRowLabel: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  templateRowDesc: {
    fontSize: moderateScale(11),
    marginTop: moderateScale(2),
  },
  timeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: moderateScale(4),
  },
  timeText: {
    fontSize: moderateScale(11),
  },
  // ── Customization Layout ───────────────────────────────────────────────────
  customizeStepContainer: {
    flex: 1,
    minHeight: 0,
  },
  customizeScroll: {
    flex: 1,
    minHeight: 0,
  },
  customizeScrollContent: {
    paddingBottom: moderateScale(8),
  },
  customizeContainer: {
    padding: moderateScale(20),
  },
  selectedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: moderateScale(20),
  },
  selectedTemplateLabel: {
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  selectedTemplateCategory: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(1),
  },
  formGroup: {
    marginBottom: moderateScale(20),
  },
  inputLabel: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: moderateScale(8),
  },
  customTitleInput: {
    minHeight: moderateScale(44),
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: moderateScale(14),
    fontSize: moderateScale(14),
  },
  coverSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  coverOptionBtn: {
    flex: 1,
    minHeight: moderateScale(54),
    borderRadius: moderateScale(8),
    overflow: 'hidden',
  },
  coverOptionPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  coverOptionText: {
    fontSize: moderateScale(10),
    fontWeight: '600',
    color: '#ffffff',
  },
  coverPreviewContainer: {
    width: '100%',
    height: verticalScale(120),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: verticalScale(4),
  },
  coverPreviewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  uploadOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    gap: scale(6),
  },
  uploadOptionText: {
    fontSize: moderateScale(13),
    fontWeight: '600',
  },
  prefillToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: moderateScale(10),
  },
  variablesInputsList: {
    gap: 10,
  },
  variableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  variableName: {
    fontSize: moderateScale(13),
    fontWeight: '500',
    flex: 0.4,
    textTransform: 'capitalize',
  },
  variableInput: {
    flex: 0.6,
    minHeight: moderateScale(38),
    borderWidth: 1,
    borderRadius: moderateScale(6),
    paddingHorizontal: moderateScale(10),
    fontSize: moderateScale(13),
  },
  modalFooter: {
    paddingHorizontal: moderateScale(20),
    paddingTop: moderateScale(14),
    borderTopWidth: 1,
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
  },
  createCanvasBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: moderateScale(46),
    borderRadius: moderateScale(10),
    gap: 8,
  },
  createCanvasBtnText: {
    color: '#ffffff',
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  renameDialogContainer: {
    width: '85%',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    padding: moderateScale(20),
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  renameDialogTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    marginBottom: moderateScale(12),
  },
  renameDialogInput: {
    borderWidth: 1,
    borderRadius: moderateScale(6),
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(8),
    fontSize: moderateScale(14),
    marginBottom: moderateScale(16),
  },
  renameDialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  renameDialogBtn: {
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(8),
  },
});
