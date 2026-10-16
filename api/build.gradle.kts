plugins {
    java
    id("org.springframework.boot") version "3.4.2"
    id("io.spring.dependency-management") version "1.1.7"
}
group = "com.niramoy"
java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
repositories { mavenCentral() }
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("org.springframework.boot:spring-boot-starter-data-r2dbc")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    runtimeOnly("org.postgresql:r2dbc-postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("io.projectreactor:reactor-test")
    testImplementation("org.testcontainers:postgresql:1.20.4")
    testImplementation("org.testcontainers:junit-jupiter:1.20.4")
    testImplementation("org.flywaydb:flyway-core:10.20.1")
    testImplementation("org.flywaydb:flyway-database-postgresql:10.20.1")
    testRuntimeOnly("org.postgresql:postgresql:42.7.4")
}
// The p95 budget tests (§10.6, *ScaleIntegrationTest) run in their own JVM after every other test, one class at a time, so
// the timer measures the API and not the rest of the suite; `test` excludes them and is finalized by `scaleTest`, so
// `./gradlew test` (CI) and `./gradlew cleanTest test` still run them and fail on them.
val scaleTests = "**/*ScaleIntegrationTest*"
val scaleTest by tasks.registering(Test::class) {
    description = "Runs the API p95 budget tests (*ScaleIntegrationTest) alone, after the test task."
    group = "verification"
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    useJUnitPlatform()
    include(scaleTests)
    maxParallelForks = 1
    testLogging { events("passed", "failed"); showStandardStreams = true; exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
    shouldRunAfter(tasks.test)
    outputs.upToDateWhen { false }
    // `./gradlew test --tests X` runs only X; run a scale test alone with `./gradlew scaleTest --tests X`.
    onlyIf("scaleTest is asked for, or the test run is not filtered with --tests") {
        val args = gradle.startParameter.taskRequests.flatMap { it.args }
        args.any { it.endsWith("scaleTest") } || args.none { it == "--tests" || it.startsWith("--tests=") }
    }
}
tasks.test {
    useJUnitPlatform()
    exclude(scaleTests)
    finalizedBy(scaleTest)
}
tasks.check { dependsOn(scaleTest) }
