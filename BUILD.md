# Build Guide (Fedora + Capacitor + APK)

This is the full working process to build an Android APK for this project.

## 1) Project root setup

From the project root:

```bash
npm install
```

If Android platform is not added yet:

```bash
npm run cap:add:android
```

Sync Capacitor with hosted app URL:

```bash
CAPACITOR_SERVER_URL=https://proctor-phi.vercel.app npm run cap:sync
```

## 2) Java setup (Fedora)

If Gradle fails with:
- `Unsupported class file major version 69`

You are on Java 25 and must switch to Java 21 (or 17).

Install Java 21:

```bash
sudo dnf install -y java-21-openjdk java-21-openjdk-devel
```

Switch Java:

```bash
sudo alternatives --config java
sudo alternatives --config javac
java -version
```

Expected: Java `21.x` (or `17.x`).

## 3) Android SDK setup

Go to Android folder:

```bash
cd android
```

Set SDK path:

```bash
mkdir -p "$HOME/Android/Sdk"
printf "sdk.dir=%s\n" "$HOME/Android/Sdk" > local.properties
```

Set environment variables:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Pin Gradle to current Java:

```bash
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(which java)")")")"
sed -i '/^org\.gradle\.java\.home=/d' gradle.properties
echo "org.gradle.java.home=$JAVA_HOME" >> gradle.properties
```

## 4) Accept SDK licenses and install required packages

```bash
yes | sdkmanager --licenses
sdkmanager "platforms;android-35" "build-tools;34.0.0" "platform-tools"
```

If `sdkmanager` is not found:

```bash
yes | "$HOME/Android/Sdk/cmdline-tools/latest/bin/sdkmanager" --licenses
"$HOME/Android/Sdk/cmdline-tools/latest/bin/sdkmanager" "platforms;android-35" "build-tools;34.0.0" "platform-tools"
```

## 5) Build APK

Debug APK:

```bash
./gradlew --stop
./gradlew clean assembleDebug
```

Output:
- `android/app/build/outputs/apk/debug/app-debug.apk`

Release APK:

```bash
./gradlew clean assembleRelease
```

Output:
- `android/app/build/outputs/apk/release/app-release.apk`

If release signing is missing, generate signed APK in Android Studio:
- `Build` -> `Generate Signed Bundle / APK` -> `APK`

## 6) Common errors and fixes

- `Unsupported class file major version 69`
  - Switch Java from 25 to 21/17.
- `SDK location not found`
  - Ensure `android/local.properties` has valid `sdk.dir`.
- `License ... not accepted`
  - Run `yes | sdkmanager --licenses`.
- `JAVA_HOME is set to an invalid directory`
  - Set a real installed JDK path before running Gradle.
