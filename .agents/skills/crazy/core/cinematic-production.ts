import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  findMissingFramesInRange,
  splitFrameRange,
  type BlenderCameraRigMode,
  type BlenderRenderProfileId,
  type FrameRangeChunk,
} from './blender-bridge.ts';
import { detectHardwareProfile, type HardwareProfile } from './production-intelligence.ts';
import {
  assertSafeSubpathSync,
  atomicWriteFileSync,
  withAdvisoryLock,
} from './security.ts';

export type ShotCompletionStatus = 'PLANNED' | 'RENDERING' | 'PARTIAL' | 'COMPLETED' | 'FAILED';

export interface CinematicSceneBeat {
  sceneId: string;
  title: string;
  setting: string;
  moodLighting: string;
  dialogueOrVoiceover: string;
  sfxCues: string[];
  musicCue: string;
  durationSec: number;
}

export interface CinematicShotSpec {
  shotId: string;
  sceneId: string;
  description: string;
  durationSec: number;
  frameStart: number;
  frameEnd: number;
  frameCount: number;
  camera: {
    rigMode: BlenderCameraRigMode;
    focalLengthMm: number;
    dofFstop: number;
  };
  animation: {
    subjectAction: string;
    physicsSim: boolean;
    clothSim: boolean;
  };
  characterDependencies: string[];
  environmentDependencies: string[];
  assetDependencies: string[];
  lighting: {
    kelvinKey: number;
    atmosphere: 'clear' | 'volumetric-fog' | 'rain-mist' | 'neon-dusk';
    colorTransform: 'AgX' | 'Filmic';
  };
  renderConfig: {
    engine: 'CYCLES' | 'BLENDER_EEVEE_NEXT';
    profile: BlenderRenderProfileId;
    resolutionX: number;
    resolutionY: number;
    samples: number;
  };
  outputDir: string;
  chunks: FrameRangeChunk[];
  status: ShotCompletionStatus;
}

export interface CinematicProductionPlan {
  version: '3.1.0';
  projectId: string;
  title: string;
  creativeBrief: string;
  creativeDirection: string;
  fps: number;
  totalDurationSec: number;
  totalFrames: number;
  assetRegistry: {
    characters: string[];
    environments: string[];
    props: string[];
  };
  scenes: CinematicSceneBeat[];
  shots: CinematicShotSpec[];
  audioPostPlan: {
    dialogueTrackRequired: boolean;
    sfxStems: string[];
    userMusicTrackPath: string | null;
    colorGradingLut: string;
    finalVideoOutputRel: string;
  };
  createdAt: string;
}

export interface ProductionProgressReport {
  projectId: string;
  totalShots: number;
  completedShots: number;
  partialShots: number;
  failedShots: number;
  totalFrames: number;
  completedFrames: number;
  percentFramesComplete: number;
  pendingChunks: Array<{ shotId: string; chunk: FrameRangeChunk }>;
  failedChunks: Array<{ shotId: string; chunk: FrameRangeChunk }>;
}

export interface VideoAssemblyPlan {
  ffmpegAvailable: boolean;
  ffmpegCommand: string[];
  finalOutputPath: string;
  status: 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
  notes: string;
}

/**
 * Generates a structured multi-scene, multi-shot cinematic production plan from a brief,
 * splitting long durations (e.g. 90s @ 24fps = 2,160 frames) into recoverable frame-range chunks.
 */
export function createCinematicProductionPlan(input: {
  projectId: string;
  title: string;
  creativeBrief: string;
  durationSec?: number;
  fps?: number;
  chunkSizeFrames?: number;
  userMusicTrackPath?: string;
  hardware?: HardwareProfile;
}): CinematicProductionPlan {
  const fps = Math.max(12, Math.min(60, input.fps ?? 24));
  const totalDurationSec = Math.max(5, input.durationSec ?? 90);
  const totalFrames = Math.round(totalDurationSec * fps);
  const hardware = input.hardware ?? detectHardwareProfile();
  const chunkSize = Math.max(12, Math.min(120, input.chunkSizeFrames ?? (hardware.tier === 'constrained' ? 24 : 48)));

  const isSuperhero = /superhero|hero|cape|city|metropolis|trailer/i.test(input.creativeBrief);
  const chars = isSuperhero ? ['CHAR_Protagonist_Hero', 'CHAR_Antagonist_Sentinel'] : ['CHAR_Lead'];
  const envs = isSuperhero
    ? ['ENV_StormyRooftop', 'ENV_NeonCanyonStreet', 'ENV_SkylineVista']
    : ['ENV_MainStage'];
  const props = isSuperhero
    ? ['PROP_ArmoredSuitArmor', 'PROP_EnergyShockwaveFX', 'PROP_DebrisPieces']
    : ['PROP_HeroProp'];

  const actFractions = [0.16, 0.22, 0.24, 0.24, 0.14];
  const sceneTemplates = [
    {
      sceneId: 'SC-01',
      title: 'Cold Open Atmosphere',
      setting: envs[0],
      moodLighting: 'Low-key 3200K rim + cool 6800K overcast storm skylight',
      dialogueOrVoiceover: 'VO Beat 1: Establish stakes before the storm breaks.',
      sfxCues: ['distant_thunder_rumble', 'wind_gust_loop'],
      musicCue: 'Sub-bass atmospheric pulse',
      rig: 'crane' as BlenderCameraRigMode,
      lens: 35,
      atmo: 'rain-mist' as const,
    },
    {
      sceneId: 'SC-02',
      title: 'Character Reveal & Hero Entrance',
      setting: envs[0],
      moodLighting: 'Dramatic key spotlight + volumetric haze contrast',
      dialogueOrVoiceover: 'VO Beat 2: Identity and resolve revealed.',
      sfxCues: ['cloth_cape_snap', 'metallic_landing_thud'],
      musicCue: 'Rising brass/synth ostinato',
      rig: 'dolly' as BlenderCameraRigMode,
      lens: 50,
      atmo: 'volumetric-fog' as const,
    },
    {
      sceneId: 'SC-03',
      title: 'Escalation & Dynamic Pursuit',
      setting: envs[Math.min(1, envs.length - 1)],
      moodLighting: 'High-contrast wet asphalt specular highlights',
      dialogueOrVoiceover: 'VO Beat 3: Escalating conflict across the city corridor.',
      sfxCues: ['whoosh_flyby', 'debris_shatter'],
      musicCue: 'Driving percussion & rhythmic strings',
      rig: 'orbit' as BlenderCameraRigMode,
      lens: 28,
      atmo: 'neon-dusk' as const,
    },
    {
      sceneId: 'SC-04',
      title: 'Climax Impact Beat',
      setting: envs[envs.length - 1],
      moodLighting: 'Emissive flash key + backlit silhouette rim',
      dialogueOrVoiceover: 'VO Beat 4: Turning-point confrontation.',
      sfxCues: ['shockwave_boom', 'bass_drop_hitstop'],
      musicCue: 'Full orchestral/hybrid climax sting',
      rig: 'track-to' as BlenderCameraRigMode,
      lens: 35,
      atmo: 'volumetric-fog' as const,
    },
    {
      sceneId: 'SC-05',
      title: 'Title Card & Outro Hold',
      setting: envs[envs.length - 1],
      moodLighting: 'Clean rim light fading to dark slate title matte',
      dialogueOrVoiceover: 'Final signature sting.',
      sfxCues: ['title_metallic_riser'],
      musicCue: 'Decaying reverberant tail',
      rig: 'static' as BlenderCameraRigMode,
      lens: 85,
      atmo: 'clear' as const,
    },
  ];

  const scenes: CinematicSceneBeat[] = [];
  const shots: CinematicShotSpec[] = [];
  let frameCursor = 1;

  for (let i = 0; i < sceneTemplates.length; i++) {
    const tpl = sceneTemplates[i];
    const isLast = i === sceneTemplates.length - 1;
    const allocatedFrames = isLast
      ? totalFrames - frameCursor + 1
      : Math.max(fps, Math.round(totalFrames * actFractions[i]));
    const sceneEndFrame = Math.min(totalFrames, frameCursor + allocatedFrames - 1);
    const sceneFrames = sceneEndFrame - frameCursor + 1;
    const durSec = Number((sceneFrames / fps).toFixed(2));

    scenes.push({
      sceneId: tpl.sceneId,
      title: tpl.title,
      setting: tpl.setting,
      moodLighting: tpl.moodLighting,
      dialogueOrVoiceover: tpl.dialogueOrVoiceover,
      sfxCues: tpl.sfxCues,
      musicCue: tpl.musicCue,
      durationSec: durSec,
    });

    // Split each scene into 2 camera shots where long enough
    const subShotCount = sceneFrames >= fps * 4 ? 2 : 1;
    let shotStart = frameCursor;
    for (let s = 0; s < subShotCount; s++) {
      const shotFrames =
        s === subShotCount - 1 ? sceneEndFrame - shotStart + 1 : Math.floor(sceneFrames / subShotCount);
      const shotEnd = shotStart + shotFrames - 1;
      const shotId = `${tpl.sceneId}-SH${String(s + 1).padStart(2, '0')}`;

      shots.push({
        shotId,
        sceneId: tpl.sceneId,
        description: `${tpl.title} — Beat ${s + 1}: ${tpl.moodLighting}`,
        durationSec: Number((shotFrames / fps).toFixed(2)),
        frameStart: shotStart,
        frameEnd: shotEnd,
        frameCount: shotFrames,
        camera: {
          rigMode: s === 0 ? tpl.rig : 'track-to',
          focalLengthMm: s === 0 ? tpl.lens : 50,
          dofFstop: 2.8,
        },
        animation: {
          subjectAction: i === 0 ? 'Idle wind/cape settle' : i === 3 ? 'High-impact pose & shockwave' : 'Dynamic camera & character blocking',
          physicsSim: i >= 2,
          clothSim: isSuperhero,
        },
        characterDependencies: i === 0 ? [chars[0]] : chars,
        environmentDependencies: [tpl.setting],
        assetDependencies: props.slice(0, i >= 2 ? props.length : 1),
        lighting: {
          kelvinKey: i === 2 ? 4200 : 5200,
          atmosphere: tpl.atmo,
          colorTransform: 'AgX',
        },
        renderConfig: {
          engine: hardware.tier === 'constrained' ? 'BLENDER_EEVEE_NEXT' : 'CYCLES',
          profile: hardware.tier === 'constrained' ? 'laptop-cpu-preview' : 'production-1080p',
          resolutionX: hardware.tier === 'constrained' ? 854 : 1920,
          resolutionY: hardware.tier === 'constrained' ? 480 : 1080,
          samples: hardware.tier === 'constrained' ? 24 : 64,
        },
        outputDir: `renders/${input.projectId}/${shotId}`,
        chunks: splitFrameRange(shotStart, shotEnd, chunkSize, shotId),
        status: 'PLANNED',
      });

      shotStart = shotEnd + 1;
    }

    frameCursor = sceneEndFrame + 1;
  }

  return {
    version: '3.1.0',
    projectId: input.projectId,
    title: input.title,
    creativeBrief: input.creativeBrief,
    creativeDirection: `Cinematic ${totalDurationSec}s (${totalFrames} frames @ ${fps}fps) production structured into ${scenes.length} scenes and ${shots.length} recoverable shots.`,
    fps,
    totalDurationSec,
    totalFrames,
    assetRegistry: {
      characters: chars,
      environments: envs,
      props,
    },
    scenes,
    shots,
    audioPostPlan: {
      dialogueTrackRequired: true,
      sfxStems: sceneTemplates.flatMap((t) => t.sfxCues),
      userMusicTrackPath: input.userMusicTrackPath ?? null,
      colorGradingLut: 'AgX / ACES Rec.709 filmic contrast',
      finalVideoOutputRel: `renders/${input.projectId}/final/${input.projectId}_master.mp4`,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Persistent shot/chunk tracker with atomic checkpoints, failed-frame detection,
 * interruption resume, and FFmpeg assembly command planning.
 */
export class CinematicProductionTracker {
  private readonly workspaceDir: string;
  private readonly stateRelPath: string;
  private readonly stateAbsPath: string;
  private readonly lockAbsPath: string;

  constructor(workspaceDir: string, stateRelPath = '.afo/cinematic-production.json') {
    this.workspaceDir = path.resolve(workspaceDir);
    this.stateRelPath = stateRelPath;
    this.stateAbsPath = assertSafeSubpathSync(this.workspaceDir, stateRelPath);
    this.lockAbsPath = assertSafeSubpathSync(this.workspaceDir, `${stateRelPath}.lock`);
  }

  savePlan(plan: CinematicProductionPlan): void {
    withAdvisoryLock(this.lockAbsPath, () => {
      atomicWriteFileSync(this.stateAbsPath, JSON.stringify(plan, null, 2) + '\n');
    });
  }

  loadPlan(): CinematicProductionPlan {
    if (!fs.existsSync(this.stateAbsPath)) {
      throw new Error(`No cinematic production plan found at "${this.stateRelPath}".`);
    }
    return JSON.parse(fs.readFileSync(this.stateAbsPath, 'utf8')) as CinematicProductionPlan;
  }

  markChunkStatus(
    shotId: string,
    chunkId: string,
    status: FrameRangeChunk['status'],
  ): CinematicProductionPlan {
    return withAdvisoryLock(this.lockAbsPath, () => {
      const plan = this.loadPlan();
      const shot = plan.shots.find((s) => s.shotId === shotId);
      if (!shot) throw new Error(`Unknown shot "${shotId}".`);
      const chunk = shot.chunks.find((c) => c.chunkId === chunkId);
      if (!chunk) throw new Error(`Unknown chunk "${chunkId}" in shot "${shotId}".`);

      chunk.status = status;
      if (status !== 'PENDING') chunk.attempts += 1;

      if (shot.chunks.every((c) => c.status === 'COMPLETED')) {
        shot.status = 'COMPLETED';
      } else if (shot.chunks.some((c) => c.status === 'FAILED')) {
        shot.status = 'FAILED';
      } else if (shot.chunks.some((c) => c.status === 'COMPLETED')) {
        shot.status = 'PARTIAL';
      } else {
        shot.status = 'RENDERING';
      }

      atomicWriteFileSync(this.stateAbsPath, JSON.stringify(plan, null, 2) + '\n');
      return plan;
    });
  }

  /**
   * Reconciles actual frame files on disk against shot chunks and marks chunks
   * with missing/corrupt frames back to FAILED so they can be resumed cleanly.
   */
  reconcileShotFramesFromDisk(shotId: string): {
    shotId: string;
    missingFrames: number[];
    verifiedChunks: number;
  } {
    return withAdvisoryLock(this.lockAbsPath, () => {
      const plan = this.loadPlan();
      const shot = plan.shots.find((s) => s.shotId === shotId);
      if (!shot) throw new Error(`Unknown shot "${shotId}".`);

      const missingAll: number[] = [];
      let verifiedChunks = 0;

      for (const chunk of shot.chunks) {
        const missing = fs.existsSync(assertSafeSubpathSync(this.workspaceDir, shot.outputDir))
          ? findMissingFramesInRange(this.workspaceDir, shot.outputDir, chunk.frameStart, chunk.frameEnd)
          : Array.from({ length: chunk.frameCount }, (_, i) => chunk.frameStart + i);

        if (missing.length === 0) {
          chunk.status = 'COMPLETED';
          verifiedChunks += 1;
        } else {
          missingAll.push(...missing);
          if (chunk.status === 'COMPLETED') {
            chunk.status = 'FAILED';
          }
        }
      }

      shot.status =
        verifiedChunks === shot.chunks.length
          ? 'COMPLETED'
          : verifiedChunks > 0
            ? 'PARTIAL'
            : shot.chunks.some((c) => c.status === 'FAILED')
              ? 'FAILED'
              : 'PLANNED';

      atomicWriteFileSync(this.stateAbsPath, JSON.stringify(plan, null, 2) + '\n');
      return { shotId, missingFrames: missingAll, verifiedChunks };
    });
  }

  getProgressReport(): ProductionProgressReport {
    const plan = this.loadPlan();
    let completedFrames = 0;
    const pendingChunks: ProductionProgressReport['pendingChunks'] = [];
    const failedChunks: ProductionProgressReport['failedChunks'] = [];

    for (const shot of plan.shots) {
      for (const chunk of shot.chunks) {
        if (chunk.status === 'COMPLETED') {
          completedFrames += chunk.frameCount;
        } else if (chunk.status === 'FAILED') {
          failedChunks.push({ shotId: shot.shotId, chunk });
        } else {
          pendingChunks.push({ shotId: shot.shotId, chunk });
        }
      }
    }

    const completedShots = plan.shots.filter((s) => s.status === 'COMPLETED').length;
    const partialShots = plan.shots.filter((s) => s.status === 'PARTIAL').length;
    const failedShots = plan.shots.filter((s) => s.status === 'FAILED').length;

    return {
      projectId: plan.projectId,
      totalShots: plan.shots.length,
      completedShots,
      partialShots,
      failedShots,
      totalFrames: plan.totalFrames,
      completedFrames,
      percentFramesComplete:
        plan.totalFrames === 0 ? 100 : Math.round((completedFrames / plan.totalFrames) * 100),
      pendingChunks,
      failedChunks,
    };
  }

  buildVideoAssemblyPlan(): VideoAssemblyPlan {
    const plan = this.loadPlan();
    const progress = this.getProgressReport();
    const outPath = assertSafeSubpathSync(this.workspaceDir, plan.audioPostPlan.finalVideoOutputRel);

    let ffmpegAvailable = false;
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 3000 });
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
    }

    const args = [
      'ffmpeg',
      '-y',
      '-framerate',
      String(plan.fps),
      '-i',
      `${plan.shots[0]?.outputDir ?? 'renders'}/frame_%04d.png`,
      ...(plan.audioPostPlan.userMusicTrackPath
        ? ['-i', plan.audioPostPlan.userMusicTrackPath, '-shortest']
        : []),
      '-vf',
      'eq=contrast=1.06:saturation=1.04',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '18',
      outPath,
    ];

    if (!ffmpegAvailable || progress.completedFrames < plan.totalFrames) {
      return {
        ffmpegAvailable,
        ffmpegCommand: args,
        finalOutputPath: outPath,
        status: 'UNVERIFIED',
        notes: !ffmpegAvailable
          ? 'FFmpeg is not installed locally; video assembly command prepared but marked UNVERIFIED.'
          : `Only ${progress.completedFrames}/${plan.totalFrames} frames completed; assembly cannot run until all frames are rendered.`,
      };
    }

    return {
      ffmpegAvailable,
      ffmpegCommand: args,
      finalOutputPath: outPath,
      status: fs.existsSync(outPath) ? 'VERIFIED' : 'UNVERIFIED',
      notes: fs.existsSync(outPath)
        ? 'Final assembled video exists on disk.'
        : 'All frames ready and FFmpeg detected; execute ffmpegCommand to assemble and verify.',
    };
  }
}
