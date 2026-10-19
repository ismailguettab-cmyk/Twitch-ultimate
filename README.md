# Twitch Ultimate

Client Twitch pour Fire TV Stick 4K Max : lives en qualité source, pubs ignorées, chat par-dessus la vidéo plein écran, rediffusions du jour, 2e live en incrustation, rappels, clips, recherche.

L’APK est compilé par GitHub, et l’app installée sur le Fire Stick se met à jour toute seule quand vous publiez une nouvelle version. Vous n’avez rien à installer sur votre ordinateur.

---

## Mise en place (une seule fois, environ 15 minutes)

### 1. Créer le dépôt GitHub

1. Créez un compte sur [github.com](https://github.com) si vous n’en avez pas.
2. Cliquez sur **New repository**. Nom : `twitch-ultimate`. Visibilité : **Public** (nécessaire pour que l’app puisse télécharger ses mises à jour). Cochez **Add a README file**, puis **Create repository**.
3. Dans le dépôt, cliquez sur **Add file > Upload files** et glissez **tout le contenu** de ce dossier (pas le dossier lui-même). Validez avec **Commit changes**.
4. Vérifiez que le fichier `.github/workflows/build.yml` est bien présent. Sur Mac, le Finder masque les dossiers commençant par un point : s’il manque, faites **Add file > Create new file**, tapez `.github/workflows/build.yml` comme nom, collez le contenu du fichier et validez.

### 2. Créer l’application côté Twitch

1. Allez sur [dev.twitch.tv/console](https://dev.twitch.tv/console) et connectez-vous avec votre compte Twitch.
2. **Register Your Application** :
   - **Name** : un nom sans le mot « Twitch », que Twitch refuse. Par exemple `TU-TV-votrepseudo`.
   - **OAuth Redirect URLs** : `http://localhost`
   - **Category** : Application Integration
   - **Client Type** : **Public** (important, c’est ce qui permet la connexion par QR code)
3. Validez, ouvrez l’application et copiez le **Client ID**.

### 3. Donner les clés à GitHub

Dans votre dépôt : **Settings > Secrets and variables > Actions**.

Onglet **Secrets**, bouton **New repository secret** :

| Nom | Valeur |
|---|---|
| `KEYSTORE_B64` | tout le contenu du fichier `KEYSTORE_B64.txt` |
| `KEYSTORE_PASSWORD` | le contenu du fichier `KEYSTORE_PASSWORD.txt` |

Onglet **Variables**, bouton **New repository variable** :

| Nom | Valeur |
|---|---|
| `TWITCH_CLIENT_ID` | le Client ID copié à l’étape 2 |

> Gardez précieusement la clé de signature (`twitch-ultimate-release.jks` et son mot de passe). Android n’accepte une mise à jour que si elle est signée avec la même clé. Si vous la perdez, il faudra désinstaller l’app et la réinstaller.

### 4. Publier la première version

1. Dans le dépôt : **Releases > Create a new release**.
2. **Choose a tag** : tapez `v1.0.0` puis **Create new tag**. Titre : `1.0.0`.
3. **Publish release**.
4. Allez dans l’onglet **Actions** : la compilation dure environ 5 minutes. Quand elle est verte, le fichier `twitch-ultimate.apk` apparaît dans la release.

Si la compilation échoue (croix rouge), ouvrez-la, copiez les dernières lignes rouges et envoyez-les à Claude.

### 5. Installer sur le Fire Stick

1. Sur le Fire Stick : **Paramètres > Ma Fire TV > À propos**, cliquez 7 fois sur le nom de l’appareil pour activer les **Options pour les développeurs**.
2. Installez l’app **Downloader** depuis l’Appstore Amazon.
3. **Paramètres > Ma Fire TV > Options pour les développeurs > Installer des applis inconnues** : activez **Downloader**.
4. Ouvrez Downloader et entrez l’adresse :
   `https://github.com/VOTRE-PSEUDO-GITHUB/twitch-ultimate/releases/latest/download/twitch-ultimate.apk`
5. Installez, ouvrez Twitch Ultimate, scannez le QR code avec votre téléphone. C’est fini.

Astuce : cette adresse donne toujours la dernière version. Vous pouvez la raccourcir sur un site de liens courts pour la taper plus vite.

---

## Mettre à jour l’app

1. Modifiez le code sur GitHub (ou remplacez les fichiers corrigés par Claude via **Add file > Upload files**).
2. Créez une nouvelle release avec un numéro plus grand : `v1.0.1`, `v1.1.0`…
3. Attendez que l’onglet **Actions** soit vert.
4. Au prochain lancement, l’app affiche **Mise à jour disponible**. Choisissez **Installer maintenant**.

La première fois, le Fire Stick demande d’autoriser Twitch Ultimate à installer des applis : acceptez (ou activez-le dans **Options pour les développeurs > Installer des applis inconnues**). Vos réglages, favoris et votre connexion sont conservés.

Dans **Réglages > Mises à jour**, vous pouvez aussi vérifier manuellement.

## Signaler et corriger un bug

Dans l’app : **Réglages > Signaler un problème**. Vous voyez le journal des derniers événements et un QR code qui ouvre un rapport pré-rempli sur GitHub avec ce journal. Pour faire corriger un bug par Claude, envoyez-lui ce journal avec une description de ce qui s’est passé.

Chaque modification envoyée sur GitHub produit aussi un APK de test (onglet **Actions**, section *Artifacts*), sans le proposer en mise à jour.

## Tester l’interface sans le Fire Stick

L’interface fonctionne dans un navigateur, en mode démo avec des données fictives :

1. Dans le dépôt : **Settings > Pages**, source **Deploy from a branch**, branche `main`, dossier `/ (root)`.
2. Ouvrez `https://VOTRE-PSEUDO-GITHUB.github.io/twitch-ultimate/app/src/main/assets/web/` dans Chrome.
3. Flèches, Entrée et Échap remplacent la télécommande.

---

## Organisation du code

Toute la logique est en JavaScript dans `app/src/main/assets/web/`. La partie Android ne fait que l’héberger.

| Fichier | Rôle |
|---|---|
| `js/app.js` | Démarrage, navigation entre écrans, touches, mises à jour, connexion |
| `js/ui.js` | Les écrans : accueil, aujourd’hui, suivis, catégories, recherche, réglages |
| `js/player.js` | Le lecteur : qualité, chat, 2e live, statistiques, zapping |
| `js/playback.js` | Récupération des flux vidéo et **blocage des pubs** |
| `js/twitch.js` | API Twitch : chaînes suivies, rediffs, clips, planning, recherche |
| `js/chat.js` | Chat Twitch avec les emotes |
| `js/nav.js` | Déplacement à la télécommande |
| `js/store.js` | Réglages, favoris, progression des rediffs |
| `js/mock.js` | Données du mode démo |
| `css/app.css` | Tout le design |
| `app/src/main/java/.../*.kt` | Coque Android : WebView, réseau, installation des mises à jour |

**Si les pubs réapparaissent** un jour, c’est que Twitch a changé sa méthode : la partie à adapter est la classe `AdGuard` dans `js/playback.js`.

## Limites connues

- Les rediffusions réservées aux abonnés ne sont pas lisibles : Twitch ne délivre pas ces flux aux applications tierces.
- Le chat des rediffusions et des clips n’est pas encore disponible ; le chat des lives l’est.
- Le chat est en lecture seule.
- Le blocage des pubs est contraire aux conditions d’utilisation de Twitch. Le risque est faible pour un usage personnel, mais il existe.
