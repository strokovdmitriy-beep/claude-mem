import React, { useState, useCallback, useEffect } from 'react';
import type { Settings } from '../types';
import { TerminalPreview } from './TerminalPreview';
import { useContextPreview } from '../hooks/useContextPreview';
import { DEFAULT_SETTINGS } from '../constants/settings';
import { isClaudeMemObserverBaseUrl } from '../utils/observer-endpoint';
import { OPENAI_COMPAT_PRESET_OPTIONS, openAICompatPresetOption } from '../constants/openai-compat-presets';

interface ContextSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  /** False until GET /api/settings succeeds; `settings` holds defaults until then. */
  isLoaded: boolean;
  /** Why the initial GET failed, or null. */
  loadError: string | null;
  onRetryLoad: () => void;
  onSave: (settings: Settings) => void;
  isSaving: boolean;
  saveStatus: string;
}

export function saveStatusClass(saveStatus: string): string {
  return saveStatus.includes('✗') ? 'error' : saveStatus.includes('✓') ? 'success' : '';
}

function CollapsibleSection({
  title,
  description,
  children,
  defaultOpen = true
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`settings-section-collapsible ${isOpen ? 'open' : ''}`}>
      <button
        className="section-header-btn"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <div className="section-header-content">
          <span className="section-title">{title}</span>
          {description && <span className="section-description">{description}</span>}
        </div>
        <svg
          className={`chevron-icon ${isOpen ? 'rotated' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && <div className="section-content">{children}</div>}
    </div>
  );
}

function FormField({
  label,
  tooltip,
  children
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-field-label">
        {label}
        {tooltip && (
          <span className="tooltip-trigger" title={tooltip}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function ToggleSwitch({
  id,
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-info">
        <label htmlFor={id} className="toggle-label">{label}</label>
        {description && <span className="toggle-description">{description}</span>}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        className={`toggle-switch ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

export function ContextSettingsModal({
  isOpen,
  onClose,
  settings,
  isLoaded,
  loadError,
  onRetryLoad,
  onSave,
  isSaving,
  saveStatus
}: ContextSettingsModalProps) {
  const [formState, setFormState] = useState<Settings>(settings);
  // From the saved settings, not the form: the field stays editable while a
  // user types any other URL, and read-only for the observer's own endpoint.
  const observerManagesBaseUrl = isClaudeMemObserverBaseUrl(settings.CLAUDE_MEM_OPENROUTER_BASE_URL);

  useEffect(() => {
    setFormState(settings);
  }, [settings]);

  const {
    preview,
    isLoading,
    error,
    projects,
    sources,
    selectedSource,
    setSelectedSource,
    selectedProject,
    setSelectedProject
  } = useContextPreview(formState);

  const updateSetting = useCallback((key: keyof Settings, value: string) => {
    const newState = { ...formState, [key]: value };
    setFormState(newState);
  }, [formState]);

  const handleSave = useCallback(() => {
    onSave(formState);
  }, [formState, onSave]);

  const toggleBoolean = useCallback((key: keyof Settings) => {
    const currentValue = formState[key];
    const newValue = currentValue === 'true' ? 'false' : 'true';
    updateSetting(key, newValue);
  }, [formState, updateSetting]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="context-settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Настройки</h2>
          <div className="header-controls">
            <label className="preview-selector">
              Источник:
              <select
                value={selectedSource || ''}
                onChange={(e) => setSelectedSource(e.target.value)}
                disabled={sources.length === 0}
              >
                <option value="">Все источники</option>
                {sources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
            <label className="preview-selector">
              Проект:
              <select
                value={selectedProject || ''}
                onChange={(e) => setSelectedProject(e.target.value)}
                disabled={projects.length === 0}
              >
                {projects.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
            </label>
            <button
              onClick={onClose}
              className="modal-close-btn"
              title="Закрыть (Esc)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body - 2 columns */}
        <div className="modal-body">
          {/* Left column - Terminal Preview */}
          <div className="preview-column">
            <div className="preview-content">
              {error ? (
                <div style={{ color: 'var(--color-accent-error)' }}>
                  Ошибка загрузки превью: {error}
                </div>
              ) : (
                <TerminalPreview content={preview} isLoading={isLoading} />
              )}
            </div>
          </div>

          {/* Right column - Settings Panel. Before the initial load the form
              holds defaults; saving them would overwrite settings.json. */}
          <fieldset className="settings-column" disabled={isSaving || !isLoaded}
            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            {/* Section 1: Loading */}
            <CollapsibleSection
              title="Загрузка"
              description="Сколько наблюдений добавлять в контекст"
            >
              <FormField
                label="Наблюдения"
                tooltip="Количество последних наблюдений в контексте (1–200)"
              >
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={formState.CLAUDE_MEM_CONTEXT_OBSERVATIONS || DEFAULT_SETTINGS.CLAUDE_MEM_CONTEXT_OBSERVATIONS}
                  onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_OBSERVATIONS', e.target.value || DEFAULT_SETTINGS.CLAUDE_MEM_CONTEXT_OBSERVATIONS)}
                />
              </FormField>
              <ToggleSwitch
                id="session-start-all-sources"
                label="Учитывать все источники в начале сессии"
                description="Показывать наблюдения из Claude, Codex и других агентов в стартовом контексте"
                checked={formState.CLAUDE_MEM_SESSION_START_INCLUDE_ALL_SOURCES === 'true'}
                onChange={() => toggleBoolean('CLAUDE_MEM_SESSION_START_INCLUDE_ALL_SOURCES')}
              />
              <FormField
                label="Сессии"
                tooltip="Количество последних сессий, из которых берутся наблюдения (1–50)"
              >
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formState.CLAUDE_MEM_CONTEXT_SESSION_COUNT || DEFAULT_SETTINGS.CLAUDE_MEM_CONTEXT_SESSION_COUNT}
                  onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_SESSION_COUNT', e.target.value || DEFAULT_SETTINGS.CLAUDE_MEM_CONTEXT_SESSION_COUNT)}
                />
              </FormField>
            </CollapsibleSection>

            {/* Section 2: Display */}
            <CollapsibleSection
              title="Отображение"
              description="Что показывать в таблицах контекста"
            >
              <div className="display-subsection">
                <span className="subsection-label">Полные наблюдения</span>
                <FormField
                  label="Количество"
                  tooltip="Сколько наблюдений показывать развёрнуто (0–20)"
                >
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formState.CLAUDE_MEM_CONTEXT_FULL_COUNT || DEFAULT_SETTINGS.CLAUDE_MEM_CONTEXT_FULL_COUNT}
                    onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_FULL_COUNT', e.target.value || DEFAULT_SETTINGS.CLAUDE_MEM_CONTEXT_FULL_COUNT)}
                  />
                </FormField>
                <FormField
                  label="Поле"
                  tooltip="Какое поле разворачивать для полных наблюдений"
                >
                  <select
                    value={formState.CLAUDE_MEM_CONTEXT_FULL_FIELD || 'narrative'}
                    onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_FULL_FIELD', e.target.value)}
                  >
                    <option value="narrative">Описание</option>
                    <option value="facts">Факты</option>
                  </select>
                </FormField>
              </div>

              <div className="display-subsection">
                <span className="subsection-label">Экономика токенов</span>
                <div className="toggle-group">
                  <ToggleSwitch
                    id="show-read-tokens"
                    label="Стоимость чтения"
                    description="Токенов на чтение этого наблюдения"
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS')}
                  />
                  <ToggleSwitch
                    id="show-work-tokens"
                    label="Затраты на работу"
                    description="Токенов потрачено на создание наблюдения"
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS')}
                  />
                  <ToggleSwitch
                    id="show-savings-amount"
                    label="Экономия"
                    description="Сколько токенов сэкономлено при повторном использовании контекста"
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT')}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Section 4: Advanced */}
            <CollapsibleSection
              title="Дополнительно"
              description="Выбор ИИ-провайдера и модели"
              defaultOpen={false}
            >
              <FormField
                label="ИИ-провайдер"
                tooltip="Провайдер для создания наблюдений: Claude, Gemini, OpenRouter, Codex или любой OpenAI-совместимый сервис"
              >
                <select
                  value={formState.CLAUDE_MEM_PROVIDER || 'claude'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_PROVIDER', e.target.value)}
                >
                  <option value="claude">Claude (ваш аккаунт Claude)</option>
                  <option value="gemini">Gemini (API-ключ)</option>
                  <option value="openrouter">OpenRouter / наблюдатель claude-mem</option>
                  <option value="codex">Codex (ваша подписка ChatGPT)</option>
                  <option value="openai-compatible">OpenAI-совместимый сервис (свой ключ)</option>
                </select>
              </FormField>

              {formState.CLAUDE_MEM_PROVIDER === 'claude' && (
                <FormField
                  label="Модель Claude"
                  tooltip="Модель Claude для создания наблюдений"
                >
                  <select
                    value={formState.CLAUDE_MEM_MODEL || 'haiku'}
                    onChange={(e) => updateSetting('CLAUDE_MEM_MODEL', e.target.value)}
                  >
                    <option value="haiku">haiku (самая быстрая)</option>
                    <option value="sonnet">sonnet (сбалансированная)</option>
                    <option value="opus">opus (наивысшее качество)</option>
                  </select>
                </FormField>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'codex' && (
                <FormField
                  label="Модель Codex"
                  tooltip="Необязательная модель из вашей подписки Codex. Оставьте поле пустым для модели по умолчанию. Перед запуском воркера выполните codex login."
                >
                  <input
                    type="text"
                    value={formState.CLAUDE_MEM_CODEX_MODEL || ''}
                    onChange={(e) => updateSetting('CLAUDE_MEM_CODEX_MODEL', e.target.value)}
                    placeholder="По умолчанию в Codex (например, gpt-6-luna)"
                  />
                </FormField>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'gemini' && (
                <>
                  <FormField
                    label="API-ключ Gemini"
                    tooltip="API-ключ Google AI Studio (или переменная окружения GEMINI_API_KEY)"
                  >
                    <input
                      type="password"
                      value={formState.CLAUDE_MEM_GEMINI_API_KEY || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_GEMINI_API_KEY', e.target.value)}
                      placeholder="Введите API-ключ Gemini..."
                    />
                  </FormField>
                  <FormField
                    label="Модель Gemini"
                    tooltip="Модель Gemini для создания наблюдений"
                  >
                    <select
                      value={formState.CLAUDE_MEM_GEMINI_MODEL || 'gemini-flash-latest'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_GEMINI_MODEL', e.target.value)}
                    >
                      <option value="gemini-flash-latest">gemini-flash-latest (по умолчанию, последний GA Flash)</option>
                      <option value="gemini-flash-lite-latest">gemini-flash-lite-latest (последний GA Flash-Lite)</option>
                      <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                      <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                      <option value="gemini-3-flash-preview">gemini-3-flash-preview (превью)</option>
                    </select>
                  </FormField>
                  <div className="toggle-group" style={{ marginTop: '8px' }}>
                    <ToggleSwitch
                      id="gemini-rate-limiting"
                      label="Ограничение частоты запросов"
                      description="Включите для бесплатного тарифа (10–30 запросов/мин). Отключите, если подключена оплата (1000+ запросов/мин)."
                      checked={formState.CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED === 'true'}
                      onChange={(checked) => updateSetting('CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED', checked ? 'true' : 'false')}
                    />
                  </div>
                </>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'openrouter' && (
                <>
                  <FormField
                    label="API-ключ OpenRouter"
                    tooltip="Ваш API-ключ с openrouter.ai (или переменная окружения OPENROUTER_API_KEY)"
                  >
                    <input
                      type="password"
                      value={formState.CLAUDE_MEM_OPENROUTER_API_KEY || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_API_KEY', e.target.value)}
                      placeholder="Введите API-ключ OpenRouter..."
                    />
                  </FormField>
                  <FormField
                    label="Модель OpenRouter"
                    tooltip="Идентификатор модели с openrouter.ai/models (например, anthropic/claude-haiku-4.5, google/gemini-2.5-flash)"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_MODEL || DEFAULT_SETTINGS.CLAUDE_MEM_OPENROUTER_MODEL}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_MODEL', e.target.value)}
                      placeholder={`например, ${DEFAULT_SETTINGS.CLAUDE_MEM_OPENROUTER_MODEL}`}
                    />
                  </FormField>
                  <FormField
                    label="Базовый URL OpenRouter"
                    tooltip={observerManagesBaseUrl
                      ? 'Управляется наблюдателем claude-mem. Чтобы использовать свой адрес, выполните npx claude-mem install.'
                      : 'Необязательный базовый URL OpenAI-совместимого сервиса. Оставьте пустым для openrouter.ai.'}
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_BASE_URL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_BASE_URL', e.target.value)}
                      placeholder="https://openrouter.ai/api/v1"
                      readOnly={observerManagesBaseUrl}
                    />
                  </FormField>
                  {!observerManagesBaseUrl && (
                    <FormField
                      label="Уровень рассуждений"
                      tooltip="Только для моделей openrouter.ai. «Нет» отключает рассуждения, «По умолчанию» не передаёт параметр."
                    >
                      <select
                        value={formState.CLAUDE_MEM_OPENROUTER_REASONING_EFFORT || ''}
                        onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_REASONING_EFFORT', e.target.value)}
                      >
                        <option value="">По умолчанию модели</option>
                        <option value="none">Нет (рассуждения выключены)</option>
                        <option value="minimal">Минимальный</option>
                        <option value="low">Низкий</option>
                        <option value="medium">Средний</option>
                        <option value="high">Высокий</option>
                      </select>
                    </FormField>
                  )}
                  <FormField
                    label="URL сайта (необязательно)"
                    tooltip="URL вашего сайта для аналитики OpenRouter (необязательно)"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_SITE_URL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_SITE_URL', e.target.value)}
                      placeholder="https://yoursite.com"
                    />
                  </FormField>
                  <FormField
                    label="Название приложения (необязательно)"
                    tooltip="Название вашего приложения для аналитики OpenRouter (необязательно)"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_APP_NAME || 'claude-mem'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_APP_NAME', e.target.value)}
                      placeholder="claude-mem"
                    />
                  </FormField>
                </>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'openai-compatible' && (
                <>
                  <FormField
                    label="Шаблон сервиса"
                    tooltip="Заполняет базовый URL и модель по умолчанию; поля ниже могут их переопределить"
                  >
                    <select
                      value={openAICompatPresetOption(formState.CLAUDE_MEM_OPENAI_COMPAT_PRESET).id}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENAI_COMPAT_PRESET', e.target.value)}
                    >
                      {OPENAI_COMPAT_PRESET_OPTIONS.map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </FormField>
                  {openAICompatPresetOption(formState.CLAUDE_MEM_OPENAI_COMPAT_PRESET).note && (
                    <span className="toggle-description">
                      {openAICompatPresetOption(formState.CLAUDE_MEM_OPENAI_COMPAT_PRESET).note}
                    </span>
                  )}
                  <FormField
                    label="Базовый URL"
                    tooltip="Оставьте пустым для адреса из шаблона"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENAI_COMPAT_BASE_URL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENAI_COMPAT_BASE_URL', e.target.value)}
                      placeholder={openAICompatPresetOption(formState.CLAUDE_MEM_OPENAI_COMPAT_PRESET).baseUrl || 'https://my-gateway.example.com/v1'}
                    />
                  </FormField>
                  <FormField
                    label="Модель"
                    tooltip="Идентификатор модели передаётся без изменений. Оставьте пустым для модели из шаблона"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENAI_COMPAT_MODEL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENAI_COMPAT_MODEL', e.target.value)}
                      placeholder={openAICompatPresetOption(formState.CLAUDE_MEM_OPENAI_COMPAT_PRESET).defaultModel || 'идентификатор модели'}
                    />
                  </FormField>
                  <span className="toggle-description">
                    API-ключ задаётся вне этой панели: <code>CLAUDE_MEM_OPENAI_COMPAT_API_KEY</code> в{' '}
                    <code>~/.claude-mem/settings.json</code> или <code>OPENAI_COMPAT_API_KEY</code> в{' '}
                    <code>~/.claude-mem/.env</code>. Для локальных серверов ключ не нужен.
                  </span>
                </>
              )}

              <FormField
                label="Резервный провайдер при исчерпании квоты"
                tooltip="Если у основного провайдера исчерпан лимит, отправлять создание наблюдений резервному. При выключенной опции работа ждёт восстановления квоты."
              >
                <select
                  value={formState.CLAUDE_MEM_QUOTA_FALLBACK_PROVIDER || ''}
                  onChange={(e) => updateSetting('CLAUDE_MEM_QUOTA_FALLBACK_PROVIDER', e.target.value)}
                >
                  <option value="">Выключено (ждать восстановления квоты)</option>
                  <option value="claude">Claude (ваш аккаунт Claude)</option>
                  <option value="gemini">Gemini (API-ключ)</option>
                  <option value="openrouter">OpenRouter / наблюдатель claude-mem</option>
                  <option value="openai-compatible">OpenAI-совместимый сервис</option>
                </select>
              </FormField>

              {formState.CLAUDE_MEM_QUOTA_FALLBACK_PROVIDER === 'claude' && (
                <FormField
                  label="Резервная модель Claude"
                  tooltip="Модель только для резервных запросов. Пустое поле использует настройку модели Claude и распределение по уровням."
                >
                  <input
                    type="text"
                    value={formState.CLAUDE_MEM_QUOTA_FALLBACK_MODEL || ''}
                    onChange={(e) => updateSetting('CLAUDE_MEM_QUOTA_FALLBACK_MODEL', e.target.value)}
                    placeholder="например, claude-haiku-4-5-20251001"
                  />
                </FormField>
              )}

              <FormField
                label="Путь к Claude Code CLI"
                tooltip="Путь к исполняемому файлу Claude Code CLI. Задайте его в ~/.claude-mem/settings.json или через CLAUDE_CODE_PATH, затем перезапустите воркер."
              >
                <input
                  type="text"
                  value={formState.CLAUDE_CODE_PATH || ''}
                  readOnly
                  disabled
                  placeholder="Автоопределение (задаётся в settings.json или окружении)"
                />
                <span className="toggle-description">
                  Только для чтения. Укажите <code>CLAUDE_CODE_PATH</code> в <code>~/.claude-mem/settings.json</code> или окружении.
                </span>
              </FormField>

              <FormField
                label="Порт воркера"
                tooltip="Порт фонового сервиса"
              >
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={formState.CLAUDE_MEM_WORKER_PORT || DEFAULT_SETTINGS.CLAUDE_MEM_WORKER_PORT}
                  onChange={(e) => updateSetting('CLAUDE_MEM_WORKER_PORT', e.target.value)}
                />
              </FormField>

              <div className="toggle-group" style={{ marginTop: '12px' }}>
                <ToggleSwitch
                  id="show-last-summary"
                  label="Включать последнюю сводку"
                  description="Добавлять сводку предыдущей сессии в контекст"
                  checked={formState.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY')}
                />
                <ToggleSwitch
                  id="show-last-message"
                  label="Включать последнее сообщение"
                  description="Добавлять последнее сообщение предыдущей сессии"
                  checked={formState.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE')}
                />
                <ToggleSwitch
                  id="file-read-gate"
                  label="Блокировать чтение файлов целиком"
                  description="Для файлов кода от 32 КБ с историей предлагать Claude smart_outline/smart_unfold и прошлые наблюдения вместо чтения всего файла"
                  checked={formState.CLAUDE_MEM_FILE_READ_GATE_ENABLED !== 'false'}
                  onChange={(checked) => updateSetting('CLAUDE_MEM_FILE_READ_GATE_ENABLED', checked ? 'true' : 'false')}
                />
              </div>
            </CollapsibleSection>
          </fieldset>
        </div>

        {/* Footer with Save button */}
        <div className="modal-footer">
          <div className="save-status">
            {loadError ? (
              <span className="error" role="alert">
                {loadError}{' '}
                <button type="button" onClick={onRetryLoad}>Retry</button>
              </span>
            ) : !isLoaded ? (
              <span>Loading settings…</span>
            ) : (
              saveStatus && <span className={saveStatusClass(saveStatus)}>{saveStatus}</span>
            )}
          </div>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={isSaving || !isLoaded}
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
