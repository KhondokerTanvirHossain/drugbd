package com.niramoy.bddrug.domain;
import java.util.List;

/** One page of flags, newest first. {@code hasMore} is true when another page exists. Holds emails: token callers only. */
public record FlagPage(List<Flag> items, int page, int size, boolean hasMore) {}
