<script setup lang="ts">
import { NobleProvider } from '@engine/client';
import { SERVER_URL } from './config';

/** boardgame.io debug panel: add ?debug to the URL to show it. */
const showDebug = new URLSearchParams(window.location.search).has('debug');
</script>

<template>
  <NobleProvider :server-url="SERVER_URL" :debug="showDebug">
    <router-view />
  </NobleProvider>
</template>
