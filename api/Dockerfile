FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN ./gradlew bootJar -x test --no-daemon
FROM eclipse-temurin:21-jre
COPY --from=build /src/build/libs/*.jar /app.jar
USER 1000
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
