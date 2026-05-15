import { addIcon, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { HtmlView, showError, HTML_FILE_EXTENSIONS, ICON_HTML, VIEW_TYPE_HTML, MHTML_FILE_EXTENSIONS } from './HtmlView';
import { HtmlPluginSettings, HtmlSettingTab, DEFAULT_SETTINGS } from './HtmlPluginSettings';

export default class HtmlPlugin extends Plugin {
	settings!: HtmlPluginSettings;
	
	async onload() {
		await this.loadSettings();

		// Add your own icon: https://marcus.se.net/obsidian-plugin-docs/user-interface/icons#add-your-own-icon
		/*
		addIcon(ICON_HTML, `<circle cx="50" cy="50" r="50" fill="currentColor" />`);
		*/

		this.registerView(VIEW_TYPE_HTML, (leaf: WorkspaceLeaf) => {
			return new HtmlView(leaf, this.settings);
		});

		try {
			if( this.settings.mhtmlSupport ) {
				// Support MHTML, Feature request #19
				for( let i = 0; i < MHTML_FILE_EXTENSIONS.length; ++i )
					HTML_FILE_EXTENSIONS.push( MHTML_FILE_EXTENSIONS[i] );
			}
			
			if( this.settings.extraFileExt !== '' ) {
				let efe = this.settings.extraFileExt.split(",").map(s => s.trim()).filter(s => s.length > 0); // Array<string>
				if( efe && efe.length > 0 ) {
					for( let i = 0; i < efe.length; ++i )
						HTML_FILE_EXTENSIONS.push( efe[i] );
				}
			}
			
			this.registerExtensions(HTML_FILE_EXTENSIONS, VIEW_TYPE_HTML);
		} catch (error) {
			await showError(`File extensions ${HTML_FILE_EXTENSIONS} had been registered by other plugin!`);
		}
		
		this.addSettingTab(new HtmlSettingTab(this.app, this));

		// Auto-refresh open HTML views when the underlying file changes on disk.
		// To avoid stealing OS-level focus from other apps (e.g. a terminal), we
		// only reload while Obsidian is focused. If the file changes while
		// Obsidian is in the background, the reload is deferred until Obsidian
		// regains focus. Reloads are also debounced per leaf to coalesce rapid
		// writes (editor saves, OneDrive sync).
		const reloadTimers = new WeakMap<HtmlView, number>();
		const pendingReloads = new WeakMap<HtmlView, TFile>();

		const scheduleReload = (view: HtmlView, file: TFile) => {
			const prev = reloadTimers.get(view);
			if (prev) window.clearTimeout(prev);
			const t = window.setTimeout(() => view.onLoadFile(file), 200);
			reloadTimers.set(view, t);
		};

		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (!(file instanceof TFile)) return;
			this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML).forEach((leaf: WorkspaceLeaf) => {
				const view = leaf.view as HtmlView;
				if (!(view instanceof HtmlView) || !view.file || view.file.path !== file.path) return;
				if (document.hasFocus()) {
					scheduleReload(view, file);
				} else {
					pendingReloads.set(view, file);
				}
			});
		}));

		// When Obsidian regains focus, flush any deferred reloads.
		const flushPending = () => {
			this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML).forEach((leaf: WorkspaceLeaf) => {
				const view = leaf.view as HtmlView;
				if (!(view instanceof HtmlView)) return;
				const file = pendingReloads.get(view);
				if (file && view.file && view.file.path === file.path) {
					pendingReloads.delete(view);
					scheduleReload(view, file);
				}
			});
		};
		window.addEventListener('focus', flushPending);
		this.register(() => window.removeEventListener('focus', flushPending));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}